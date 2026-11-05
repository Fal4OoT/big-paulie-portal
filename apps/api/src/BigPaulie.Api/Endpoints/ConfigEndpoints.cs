using System.Text.RegularExpressions;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

public static partial class ConfigEndpoints
{
    [GeneratedRegex("^[a-z][a-z0-9_]{0,39}$")]
    private static partial Regex KeyRegex();

    [GeneratedRegex("^\\d{5,25}$")]
    private static partial Regex SnowflakeRegex();

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex ColorRegex();

    private static readonly string[] FieldTypes = { "text", "textarea", "phone", "date", "number", "checkbox", "select", "image" };

    public sealed class SettingsInput
    {
        public string? LogChannelId { get; set; }
        public string? TourChannelId { get; set; }
        public string? TourPingRoleId { get; set; }
        public string? ImmediatePingRoleId { get; set; }
        public bool TourEnabled { get; set; } = true;
        public bool TourSkipEmpty { get; set; } = true;
        public int TourLateAfter { get; set; } = 3;
        public string? TourLateRoleId { get; set; }
        public int CouponMaxPercent { get; set; } = 20;
        public bool LoyaltyEnabled { get; set; }
        public int LoyaltyEvery { get; set; } = 5;
        public int LoyaltyPercent { get; set; } = 10;
        public int? LoyaltyExpiryDays { get; set; } = 30;
        public List<StatusSetting>? Statuses { get; set; }
    }

    private sealed class MemberRow
    {
        public Guid Id { get; set; }
        public string DiscordId { get; set; } = "";
        public string DisplayName { get; set; } = "";
        public string Username { get; set; } = "";
        public string? Avatar { get; set; }
        public string[] RoleIds { get; set; } = Array.Empty<string>();
        public DateTime LastLoginAt { get; set; }
    }

    public static void MapConfig(this WebApplication app)
    {
        // Lecture : utile à tous les formulaires.
        app.MapGet("/api/config", async (ConfigService config) =>
        {
            var settings = await config.GetSettingsAsync();
            return Results.Ok(new
            {
                clientFields = await config.GetFieldsAsync("client"),
                saleFields = await config.GetFieldsAsync("sale"),
                categories = await config.GetCategoriesAsync(),
                vehicleTypes = await config.GetVehicleTypesAsync(),
                statuses = settings.Statuses,
                permissions = Permissions.Catalog,
            });
        }).RequirePerm();

        var g = app.MapGroup("/api/admin").RequirePerm(Permissions.ConfigManage);

        g.MapGet("/config", async (ConfigService config, DiscordRestClient discord, ILoggerFactory lf) =>
        {
            object roles = Array.Empty<object>();
            object channels = Array.Empty<object>();
            string? discordError = null;
            try
            {
                roles = (await discord.GetRolesAsync(CancellationToken.None)).Select(r => new { r.Id, r.Name, color = r.Color == 0 ? null : $"#{r.Color:X6}" });
                channels = (await discord.GetTextChannelsAsync(CancellationToken.None)).Select(ch => new { ch.Id, ch.Name });
            }
            catch (Exception ex)
            {
                lf.CreateLogger("Config").LogWarning(ex, "Lecture des rôles/salons Discord impossible");
                discordError = "Impossible de lire les rôles et salons du serveur Discord (vérifie le token du bot et DISCORD_GUILD_ID).";
            }

            return Results.Ok(new
            {
                grades = await config.GetGradesAsync(),
                settings = await config.GetSettingsAsync(),
                discordRoles = roles,
                discordChannels = channels,
                discordError,
            });
        });

        g.MapGet("/members", async (NpgsqlDataSource db, ConfigService config, CurrentUserService users) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var rows = await c.QueryAsync<MemberRow>("SELECT id, discord_id, display_name, username, avatar, role_ids, last_login_at FROM users ORDER BY last_login_at DESC");
            var grades = await config.GetGradesAsync();
            return Results.Ok(rows.Select(u => new
            {
                u.Id,
                u.DiscordId,
                u.DisplayName,
                u.Username,
                avatarUrl = u.Avatar is null ? null : $"https://cdn.discordapp.com/avatars/{u.DiscordId}/{u.Avatar}.png?size=64",
                grades = grades.Where(gr => gr.DiscordRoleId is not null && u.RoleIds.Contains(gr.DiscordRoleId)).Select(gr => gr.Name),
                isAdmin = users.IsAdminDiscordId(u.DiscordId),
                u.LastLoginAt,
            }));
        });

        // ---------- Modèles (champs) ----------
        g.MapPut("/fields/{entity}", async (string entity, List<FieldDefinition> input, HttpContext http, NpgsqlDataSource db,
            ConfigService config, AuditService audit) =>
        {
            if (entity is not ("client" or "sale")) return EndpointAuth.NotFound();
            var existing = await config.GetFieldsAsync(entity);
            var types = await config.GetVehicleTypesAsync();

            // Contrôles
            var keys = new HashSet<string>();
            foreach (var f in input)
            {
                f.Label = f.Label?.Trim() ?? "";
                f.Key = f.Key?.Trim() ?? "";
                if (f.Label.Length is 0 or > 60) return EndpointAuth.Bad("Chaque champ doit avoir un libellé (60 caractères max).");
                var old = existing.FirstOrDefault(e => e.Id == f.Id);
                if (old is null)
                {
                    if (!KeyRegex().IsMatch(f.Key)) return EndpointAuth.Bad($"Clé invalide pour « {f.Label} » (minuscules, chiffres, _).");
                    if (!FieldTypes.Contains(f.Type)) return EndpointAuth.Bad($"Type invalide pour « {f.Label} ».");
                }
                else
                {
                    // La clé et le type d'un champ existant ne changent pas (les données y sont rattachées).
                    f.Key = old.Key;
                    f.Type = old.Type;
                    f.IsSystem = old.IsSystem;
                    if (old.IsSystem && old.Key is "prenom" or "nom") f.Required = true;
                }
                if (!keys.Add(f.Key)) return EndpointAuth.Bad($"La clé « {f.Key} » est utilisée deux fois.");
                f.Options = f.Type == "select"
                    ? (f.Options ?? Array.Empty<string>()).Select(o => o.Trim()).Where(o => o.Length > 0).Distinct().Take(50).ToArray()
                    : Array.Empty<string>();
                if (f.Type == "select" && f.Options.Length == 0) return EndpointAuth.Bad($"« {f.Label} » : ajoute au moins une option.");
                f.Help = string.IsNullOrWhiteSpace(f.Help) ? null : f.Help.Trim()[..Math.Min(f.Help.Trim().Length, 200)];
            }

            var removed = existing.Where(e => input.All(f => f.Id != e.Id)).ToList();
            var removedSystem = removed.FirstOrDefault(r => r.IsSystem);
            if (removedSystem is not null) return EndpointAuth.Bad($"« {removedSystem.Label} » est un champ système : il ne peut pas être supprimé.");
            var usedByType = removed.FirstOrDefault(r => types.Any(t => t.Active && t.PermitFieldKey == r.Key));
            if (usedByType is not null)
                return EndpointAuth.Bad($"« {usedByType.Label} » est le permis d'un type de véhicule : retire-le d'abord du type.");

            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();
            foreach (var r in removed)
                await c.ExecuteAsync("DELETE FROM field_definitions WHERE id = @Id", new { r.Id }, tx);

            var order = 10;
            foreach (var f in input)
            {
                var isNew = existing.All(e => e.Id != f.Id);
                await c.ExecuteAsync(isNew
                    ? """
                      INSERT INTO field_definitions (entity, key, label, type, required, sort_order, is_system, options, help)
                      VALUES (@entity, @Key, @Label, @Type, @Required, @order, false, @Options, @Help)
                      """
                    : """
                      UPDATE field_definitions SET label = @Label, required = @Required, sort_order = @order, options = @Options, help = @Help
                      WHERE id = @Id
                      """,
                    new { entity, f.Id, f.Key, f.Label, f.Type, f.Required, order, f.Options, f.Help }, tx);
                order += 10;
            }
            await tx.CommitAsync();

            await audit.LogAsync(http.Me(), "config.fields", "config", entity, "Configuration modifiée",
                $"Modèle **{(entity == "client" ? "fiche client" : "vente")}** mis à jour ({input.Count} champ(s)" +
                (removed.Count > 0 ? $", supprimé(s) : {string.Join(", ", removed.Select(r => r.Label))}" : "") + ").");
            return Results.Ok(new { ok = true });
        });

        // ---------- Catégories et types de véhicules ----------
        g.MapPut("/vehicles", async (VehiclesInput input, HttpContext http, NpgsqlDataSource db, ConfigService config, AuditService audit) =>
        {
            var clientFields = await config.GetFieldsAsync("client");
            var existingCats = await config.GetCategoriesAsync();
            var existingTypes = await config.GetVehicleTypesAsync();

            foreach (var cat in input.Categories)
            {
                cat.Label = cat.Label?.Trim() ?? "";
                if (cat.Label.Length is 0 or > 40) return EndpointAuth.Bad("Chaque catégorie doit avoir un nom (40 caractères max).");
                if (cat.Id == Guid.Empty) cat.Id = Guid.NewGuid();
            }
            foreach (var t in input.Types)
            {
                t.Label = t.Label?.Trim() ?? "";
                if (t.Label.Length is 0 or > 40) return EndpointAuth.Bad("Chaque type doit avoir un nom (40 caractères max).");
                if (input.Categories.All(cat => cat.Id != t.CategoryId)) return EndpointAuth.Bad($"Catégorie manquante pour « {t.Label} ».");
                if (!string.IsNullOrEmpty(t.PermitFieldKey) && clientFields.All(f => f.Key != t.PermitFieldKey || f.Type != "image"))
                    return EndpointAuth.Bad($"Le permis de « {t.Label} » doit être un champ image de la fiche client.");
                if (string.IsNullOrEmpty(t.PermitFieldKey)) t.PermitFieldKey = null;
                if (t.Id == Guid.Empty) t.Id = Guid.NewGuid();
            }
            if (input.Types.Count(t => t.Active) == 0) return EndpointAuth.Bad("Il faut au moins un type de véhicule actif.");
            if (input.Types.Any(t => t.Active && !input.Categories.First(cat => cat.Id == t.CategoryId).Active))
                return EndpointAuth.Bad("Un type actif ne peut pas appartenir à une catégorie désactivée.");

            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();
            var order = 10;
            foreach (var cat in input.Categories)
            {
                await c.ExecuteAsync("""
                    INSERT INTO vehicle_categories (id, label, sort_order, active, requires_plate) VALUES (@Id, @Label, @order, @Active, @RequiresPlate)
                    ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, active = EXCLUDED.active,
                        requires_plate = EXCLUDED.requires_plate
                    """, new { cat.Id, cat.Label, order, cat.Active, cat.RequiresPlate }, tx);
                order += 10;
            }
            order = 10;
            foreach (var t in input.Types)
            {
                await c.ExecuteAsync("""
                    INSERT INTO vehicle_types (id, label, category_id, permit_field_key, sort_order, active, requires_plate)
                    VALUES (@Id, @Label, @CategoryId, @PermitFieldKey, @order, @Active, @RequiresPlate)
                    ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, category_id = EXCLUDED.category_id,
                        permit_field_key = EXCLUDED.permit_field_key, sort_order = EXCLUDED.sort_order, active = EXCLUDED.active,
                        requires_plate = EXCLUDED.requires_plate
                    """, new { t.Id, t.Label, t.CategoryId, t.PermitFieldKey, order, t.Active, t.RequiresPlate }, tx);
                order += 10;
            }
            // Jamais de suppression (des ventes y sont rattachées) : ce qui a disparu de la liste est désactivé.
            var keptTypes = input.Types.Select(t => t.Id).ToArray();
            var keptCats = input.Categories.Select(cat => cat.Id).ToArray();
            await c.ExecuteAsync("UPDATE vehicle_types SET active = false WHERE NOT (id = ANY(@keptTypes))", new { keptTypes }, tx);
            await c.ExecuteAsync("UPDATE vehicle_categories SET active = false WHERE NOT (id = ANY(@keptCats))", new { keptCats }, tx);
            await tx.CommitAsync();

            await audit.LogAsync(http.Me(), "config.vehicles", "config", null, "Configuration modifiée",
                $"Catégories et types de véhicules mis à jour ({input.Categories.Count} catégorie(s), {input.Types.Count} type(s)).");
            return Results.Ok(new { ok = true });
        });

        // ---------- Grades et permissions ----------
        g.MapPut("/grades", async (List<GradeRow> input, HttpContext http, NpgsqlDataSource db, ConfigService config, AuditService audit) =>
        {
            var me = http.Me();
            foreach (var gr in input)
            {
                gr.Name = gr.Name?.Trim() ?? "";
                if (gr.Name.Length is 0 or > 40) return EndpointAuth.Bad("Chaque grade doit avoir un nom (40 caractères max).");
                gr.DiscordRoleId = string.IsNullOrWhiteSpace(gr.DiscordRoleId) ? null : gr.DiscordRoleId.Trim();
                if (gr.DiscordRoleId is not null && !SnowflakeRegex().IsMatch(gr.DiscordRoleId))
                    return EndpointAuth.Bad($"Rôle Discord invalide pour « {gr.Name} ».");
                gr.Permissions = (gr.Permissions ?? Array.Empty<string>()).Where(Permissions.IsKnown).Distinct().ToArray();
                if (gr.Id == Guid.Empty) gr.Id = Guid.NewGuid();
            }

            // Garde-fou : on ne peut pas se retirer à soi-même la gestion de la configuration.
            if (!me.IsAdmin)
            {
                var stillManager = input.Any(gr => gr.DiscordRoleId is not null && me.User.RoleIds.Contains(gr.DiscordRoleId)
                                                   && gr.Permissions.Contains(Permissions.ConfigManage));
                if (!stillManager) return EndpointAuth.Bad("Cette modification te retirerait l'accès à la configuration.");
            }

            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();
            var ids = input.Select(gr => gr.Id).ToArray();
            await c.ExecuteAsync("DELETE FROM grades WHERE NOT (id = ANY(@ids))", new { ids }, tx);
            foreach (var gr in input)
                await c.ExecuteAsync("""
                    INSERT INTO grades (id, name, discord_role_id, priority, is_staff, permissions)
                    VALUES (@Id, @Name, @DiscordRoleId, @Priority, @IsStaff, @Permissions)
                    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, discord_role_id = EXCLUDED.discord_role_id,
                        priority = EXCLUDED.priority, is_staff = EXCLUDED.is_staff, permissions = EXCLUDED.permissions
                    """, new { gr.Id, gr.Name, gr.DiscordRoleId, gr.Priority, gr.IsStaff, gr.Permissions }, tx);
            await tx.CommitAsync();

            await audit.LogAsync(me, "config.grades", "config", null, "Configuration modifiée",
                "Grades et permissions mis à jour : " + string.Join(", ", input.OrderByDescending(x => x.Priority).Select(x => x.Name)) + ".");
            return Results.Ok(new { ok = true });
        });

        // ---------- Réglages Discord + statuts ----------
        g.MapPut("/settings", async (SettingsInput input, HttpContext http, ConfigService config, AuditService audit) =>
        {
            string? Snow(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
            var s = await config.GetSettingsAsync();
            foreach (var (label, value) in new[] { ("Salon de logs", input.LogChannelId), ("Salon de tournée", input.TourChannelId),
                         ("Rôle à mentionner (tournée)", input.TourPingRoleId), ("Rôle à mentionner (immédiat)", input.ImmediatePingRoleId),
                         ("Rôle à mentionner (retards)", input.TourLateRoleId) })
                if (Snow(value) is { } v && !SnowflakeRegex().IsMatch(v)) return EndpointAuth.Bad($"{label} : identifiant invalide.");

            s.LogChannelId = Snow(input.LogChannelId);
            s.TourChannelId = Snow(input.TourChannelId);
            s.TourPingRoleId = Snow(input.TourPingRoleId);
            s.ImmediatePingRoleId = Snow(input.ImmediatePingRoleId);
            s.TourEnabled = input.TourEnabled;
            s.TourSkipEmpty = input.TourSkipEmpty;
            if (input.TourLateAfter is < 0 or > 48) return EndpointAuth.Bad("Retard : entre 0 (désactivé) et 48 tournées.");
            s.TourLateAfter = input.TourLateAfter;
            s.TourLateRoleId = Snow(input.TourLateRoleId);

            if (input.CouponMaxPercent is < 1 or > 100) return EndpointAuth.Bad("Coupon : le maximum doit être entre 1 et 100 %.");
            if (input.LoyaltyEvery is < 1 or > 100) return EndpointAuth.Bad("Fidélité : un coupon tous les 1 à 100 achats.");
            if (input.LoyaltyPercent < 1 || input.LoyaltyPercent > input.CouponMaxPercent)
                return EndpointAuth.Bad($"Fidélité : le pourcentage doit être entre 1 et {input.CouponMaxPercent} % (maximum des coupons).");
            if (input.LoyaltyExpiryDays is < 1 or > 365) return EndpointAuth.Bad("Fidélité : validité entre 1 et 365 jours (vide = sans expiration).");
            s.CouponMaxPercent = input.CouponMaxPercent;
            s.LoyaltyEnabled = input.LoyaltyEnabled;
            s.LoyaltyEvery = input.LoyaltyEvery;
            s.LoyaltyPercent = input.LoyaltyPercent;
            s.LoyaltyExpiryDays = input.LoyaltyExpiryDays;

            if (input.Statuses is not null)
            {
                foreach (var st in input.Statuses)
                {
                    var target = s.Statuses.FirstOrDefault(x => x.Code == st.Code);
                    if (target is null) continue;
                    var label = st.Label?.Trim() ?? "";
                    if (label.Length is 0 or > 40) return EndpointAuth.Bad("Chaque statut doit avoir un libellé (40 caractères max).");
                    if (!ColorRegex().IsMatch(st.Color ?? "")) return EndpointAuth.Bad($"Couleur invalide pour « {label} ».");
                    target.Label = label;
                    target.Color = st.Color!;
                }
            }

            await config.SaveSettingsAsync(s);
            http.RefreshTourBoard(); // salon, libellés ou seuil de retard ont pu changer
            await audit.LogAsync(http.Me(), "config.settings", "config", null, "Configuration modifiée", "Réglages Discord et statuts mis à jour.");
            return Results.Ok(new { ok = true });
        });
    }

    public sealed class VehiclesInput
    {
        public List<VehicleCategory> Categories { get; set; } = new();
        public List<VehicleType> Types { get; set; } = new();
    }
}
