using System.Collections.Concurrent;
using System.Security.Claims;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Infrastructure;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Auth;

public sealed class CurrentUser
{
    public required UserRow User { get; init; }
    public required IReadOnlyList<GradeRow> Grades { get; init; }
    public required IReadOnlySet<string> Permissions { get; init; }
    public bool IsAdmin { get; init; }

    public Guid Id => User.Id;
    public string Name => User.DisplayName;
    public bool Has(string permission) => IsAdmin || Permissions.Contains(permission);
}

/// <summary>
/// Résout l'utilisateur connecté et ses droits. Les rôles Discord sont resynchronisés
/// au plus toutes les 5 minutes : un grade retiré sur Discord est retiré du portail rapidement.
/// </summary>
public sealed class CurrentUserService
{
    private static readonly TimeSpan RoleSyncInterval = TimeSpan.FromMinutes(5);
    private static readonly ConcurrentDictionary<string, (DateTime At, string[]? Roles)> BotLookupCache = new();

    private readonly NpgsqlDataSource _db;
    private readonly DiscordRestClient _discord;
    private readonly ConfigService _config;
    private readonly PortalOptions _opt;
    private readonly ILogger<CurrentUserService> _log;

    public CurrentUserService(NpgsqlDataSource db, DiscordRestClient discord, ConfigService config, PortalOptions opt, ILogger<CurrentUserService> log)
    {
        _db = db;
        _discord = discord;
        _config = config;
        _opt = opt;
        _log = log;
    }

    public const string ItemKey = "bp.currentUser";

    public bool IsAdminDiscordId(string discordId) => _opt.AdminDiscordIds.Contains(discordId);

    /// <summary>Utilisateur de la requête (cookie). Null si non connecté ou si l'accès a été retiré.</summary>
    public async Task<CurrentUser?> GetAsync(HttpContext http)
    {
        if (http.Items.TryGetValue(ItemKey, out var cached)) return cached as CurrentUser;

        CurrentUser? result = null;
        var idClaim = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(idClaim, out var userId))
        {
            await using var c = await _db.OpenConnectionAsync();
            var user = await c.QuerySingleOrDefaultAsync<UserRow>("SELECT * FROM users WHERE id = @userId", new { userId });
            if (user is not null)
            {
                if (DateTime.UtcNow - DateTime.SpecifyKind(user.RolesSyncedAt, DateTimeKind.Utc) > RoleSyncInterval)
                    user = await RefreshRolesAsync(c, user);

                if (user is not null) result = await BuildAsync(user);
            }
        }

        // Un utilisateur sans aucun droit est traité comme non autorisé.
        if (result is not null && !result.IsAdmin && result.Permissions.Count == 0) result = null;

        http.Items[ItemKey] = result;
        return result;
    }

    public async Task<CurrentUser> BuildAsync(UserRow user)
    {
        var allGrades = await _config.GetGradesAsync();
        var grades = allGrades.Where(g => !string.IsNullOrEmpty(g.DiscordRoleId) && user.RoleIds.Contains(g.DiscordRoleId)).ToList();
        var isAdmin = IsAdminDiscordId(user.DiscordId);
        var perms = grades.SelectMany(g => g.Permissions).Where(Permissions.IsKnown).ToHashSet();
        if (isAdmin) perms.UnionWith(Permissions.All);

        return new CurrentUser { User = user, Grades = grades, Permissions = perms, IsAdmin = isAdmin };
    }

    private async Task<UserRow?> RefreshRolesAsync(NpgsqlConnection c, UserRow user)
    {
        try
        {
            var member = await _discord.GetMemberAsync(user.DiscordId, CancellationToken.None);
            var roles = member?.Roles ?? Array.Empty<string>();
            await c.ExecuteAsync("UPDATE users SET role_ids = @roles, roles_synced_at = now() WHERE id = @id", new { roles, id = user.Id });
            user.RoleIds = roles;
            user.RolesSyncedAt = DateTime.UtcNow;
            return user;
        }
        catch (Exception ex)
        {
            // Discord injoignable : on garde les rôles connus plutôt que de bloquer tout le monde.
            _log.LogWarning(ex, "Synchronisation des rôles impossible pour {User}, rôles précédents conservés", user.DiscordId);
            return user;
        }
    }

    /// <summary>Droits d'un membre Discord, pour les commandes du bot (même s'il ne s'est jamais connecté au portail).</summary>
    public async Task<(CurrentUser? User, string? Error)> ForDiscordIdAsync(string discordId)
    {
        string[]? roles;
        if (BotLookupCache.TryGetValue(discordId, out var hit) && DateTime.UtcNow - hit.At < TimeSpan.FromMinutes(1))
        {
            roles = hit.Roles;
        }
        else
        {
            try
            {
                var member = await _discord.GetMemberAsync(discordId, CancellationToken.None);
                roles = member?.Roles;
                BotLookupCache[discordId] = (DateTime.UtcNow, roles);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Lecture du membre {Discord} impossible", discordId);
                return (null, "Discord est momentanément injoignable.");
            }
        }

        if (roles is null && !IsAdminDiscordId(discordId)) return (null, "Tu n'es pas membre du serveur.");

        await using var c = await _db.OpenConnectionAsync();
        var row = await c.QuerySingleOrDefaultAsync<UserRow>("SELECT * FROM users WHERE discord_id = @discordId", new { discordId })
                  ?? new UserRow { Id = Guid.Empty, DiscordId = discordId, DisplayName = discordId, Username = discordId };
        row.RoleIds = roles ?? Array.Empty<string>();

        var user = await BuildAsync(row);
        if (!user.IsAdmin && user.Permissions.Count == 0) return (null, "Aucun grade du portail ne t'est attribué.");
        return (user, null);
    }
}
