using System.Security.Claims;
using System.Security.Cryptography;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Infrastructure;
using Dapper;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

public static class AuthEndpoints
{
    private const string StateCookie = "bp_oauth_state";

    public static void MapAuth(this WebApplication app)
    {
        var g = app.MapGroup("/api/auth");

        g.MapGet("/login", (HttpContext http, DiscordRestClient discord, PortalOptions opt, string? returnUrl) =>
        {
            var state = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
            var safeReturn = IsLocalPath(returnUrl) ? returnUrl! : "/";
            http.Response.Cookies.Append(StateCookie, $"{state}|{safeReturn}", new CookieOptions
            {
                HttpOnly = true,
                Secure = opt.IsHttps,
                SameSite = SameSiteMode.Lax,
                MaxAge = TimeSpan.FromMinutes(10),
                Path = "/api/auth",
            });
            return Results.Redirect(discord.BuildAuthorizeUrl(state));
        });

        g.MapGet("/callback", async (HttpContext http, DiscordRestClient discord, NpgsqlDataSource db,
            CurrentUserService users, ILoggerFactory lf, string? code, string? state, string? error) =>
        {
            var log = lf.CreateLogger("Auth");
            var cookie = http.Request.Cookies[StateCookie];
            http.Response.Cookies.Delete(StateCookie, new CookieOptions { Path = "/api/auth" });

            if (error is not null) return Results.Redirect("/login?erreur=annule");
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state) || cookie is null) return Results.Redirect("/login?erreur=session");

            var parts = cookie.Split('|', 2);
            if (parts.Length != 2 || !CryptographicOperations.FixedTimeEquals(
                    System.Text.Encoding.ASCII.GetBytes(parts[0]), System.Text.Encoding.ASCII.GetBytes(state)))
                return Results.Redirect("/login?erreur=session");
            var returnUrl = IsLocalPath(parts[1]) ? parts[1] : "/";

            var du = await discord.ExchangeCodeForUserAsync(code, http.RequestAborted);
            if (du is null) return Results.Redirect("/login?erreur=discord");

            DiscordMember? member;
            try { member = await discord.GetMemberAsync(du.Id, http.RequestAborted); }
            catch (Exception ex)
            {
                log.LogError(ex, "Lecture du membre impossible (token du bot / ID du serveur ?)");
                return Results.Redirect("/login?erreur=discord");
            }

            if (member is null && !users.IsAdminDiscordId(du.Id)) return Results.Redirect("/login?erreur=serveur");

            var displayName = member?.Nick ?? du.GlobalName ?? du.Username;
            await using var c = await db.OpenConnectionAsync();
            var row = await c.QuerySingleAsync<UserRow>("""
                INSERT INTO users (discord_id, username, display_name, avatar, role_ids, roles_synced_at, last_login_at)
                VALUES (@Id, @Username, @displayName, @Avatar, @roles, now(), now())
                ON CONFLICT (discord_id) DO UPDATE SET
                    username = EXCLUDED.username, display_name = EXCLUDED.display_name, avatar = EXCLUDED.avatar,
                    role_ids = EXCLUDED.role_ids, roles_synced_at = now(), last_login_at = now()
                RETURNING *
                """, new { du.Id, du.Username, displayName, du.Avatar, roles = member?.Roles ?? Array.Empty<string>() });

            var me = await users.BuildAsync(row);
            if (!me.IsAdmin && me.Permissions.Count == 0) return Results.Redirect("/login?erreur=grade");

            var identity = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, row.Id.ToString()),
                new Claim(ClaimTypes.Name, row.DisplayName),
            }, CookieAuthenticationDefaults.AuthenticationScheme);

            await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true, ExpiresUtc = DateTimeOffset.UtcNow.AddDays(14) });

            return Results.Redirect(returnUrl);
        });

        g.MapPost("/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Ok(new { ok = true });
        });

        app.MapGet("/api/me", (HttpContext http) =>
        {
            var me = http.Me();
            return Results.Ok(new
            {
                id = me.Id,
                discordId = me.User.DiscordId,
                name = me.Name,
                username = me.User.Username,
                avatarUrl = me.User.Avatar is null ? null : $"https://cdn.discordapp.com/avatars/{me.User.DiscordId}/{me.User.Avatar}.png?size=128",
                grades = me.Grades.OrderByDescending(g => g.Priority).Select(g => new { g.Id, g.Name, g.IsStaff }),
                permissions = me.IsAdmin ? Permissions.All : me.Permissions.ToArray(),
                isAdmin = me.IsAdmin,
            });
        }).RequirePerm();
    }

    private static bool IsLocalPath(string? url) =>
        !string.IsNullOrEmpty(url) && url.StartsWith('/') && !url.StartsWith("//") && !url.StartsWith("/\\");
}
