using System.Text.RegularExpressions;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Infrastructure;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

/// <summary>
/// Partenariats (garage de mécanique / customisation) : un client qui vient avec son véhicule dans les X heures
/// suivant la livraison obtient une réduction. Les employés du partenaire ont un espace limité :
/// véhicules éligibles, validation des customisations, liste de nos employés et contrat.
/// </summary>
public static partial class PartnerEndpoints
{
    [GeneratedRegex("^\\d{5,25}$")]
    private static partial Regex SnowflakeRegex();

    public sealed class PartnerRow
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = "";
        public bool Active { get; set; } = true;
        public int DiscountPercent { get; set; } = 10;
        public int WindowHours { get; set; } = 24;
        public Guid[] CategoryIds { get; set; } = Array.Empty<Guid>();
        public string ClientTerms { get; set; } = "";
        public string ContractTerms { get; set; } = "";
        public string? ChannelId { get; set; }
    }

    public sealed class ValidateInput
    {
        public decimal? Amount { get; set; }
        public string? Note { get; set; }
    }

    public sealed class CancelInput
    {
        public string? Reason { get; set; }
    }

    private sealed class EligibleRow
    {
        public Guid SaleId { get; set; }
        public long Number { get; set; }
        public string VehicleName { get; set; } = "";
        public string VehicleTypeLabel { get; set; } = "";
        public string? Plate { get; set; }
        public string ClientName { get; set; } = "";
        public DateTime DeliveredAt { get; set; }
        public DateTime ExpiresAt { get; set; }
        public Guid? ValidationId { get; set; }
        public decimal? Amount { get; set; }
        public string? Note { get; set; }
        public DateTime? ValidatedAt { get; set; }
        public string? ValidatedByName { get; set; }
    }

    private sealed class ValidationRow
    {
        public Guid Id { get; set; }
        public Guid PartnerId { get; set; }
        public string PartnerName { get; set; } = "";
        public Guid SaleId { get; set; }
        public long Number { get; set; }
        public string VehicleName { get; set; } = "";
        public string? Plate { get; set; }
        public string ClientName { get; set; } = "";
        public DateTime? DeliveredAt { get; set; }
        public decimal? Amount { get; set; }
        public string? Note { get; set; }
        public DateTime ValidatedAt { get; set; }
        public string? ValidatedByName { get; set; }
    }

    private sealed class EmployeeRow
    {
        public string DisplayName { get; set; } = "";
        public string DiscordId { get; set; } = "";
        public string? Avatar { get; set; }
        public string[] RoleIds { get; set; } = Array.Empty<string>();
    }

    private const string ClientNameSql = "trim(coalesce(c.data->>'prenom','') || ' ' || coalesce(c.data->>'nom',''))";

    public static async Task<List<PartnerRow>> GetPartnersAsync(NpgsqlConnection c, bool activeOnly = false) =>
        (await c.QueryAsync<PartnerRow>(
            $"SELECT id, name, active, discount_percent, window_hours, category_ids, client_terms, contract_terms, channel_id FROM partners {(activeOnly ? "WHERE active" : "")} ORDER BY name"))
        .ToList();

    /// <summary>Véhicules livrés dans le délai du partenaire et de catégorie éligible.</summary>
    private static Task<IEnumerable<EligibleRow>> EligibleAsync(NpgsqlConnection c, PartnerRow p, Guid? saleId = null) =>
        c.QueryAsync<EligibleRow>($"""
            SELECT s.id AS sale_id, s.number, s.vehicle_name, vt.label AS vehicle_type_label, s.plate, {ClientNameSql} AS client_name,
                   s.delivered_at, s.delivered_at + make_interval(hours => @hours) AS expires_at,
                   pv.id AS validation_id, pv.amount, pv.note, pv.validated_at, u.display_name AS validated_by_name
            FROM sales s
            JOIN clients c ON c.id = s.client_id AND c.deleted_at IS NULL
            JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
            LEFT JOIN partner_validations pv ON pv.sale_id = s.id AND pv.partner_id = @pid AND pv.cancelled_at IS NULL
            LEFT JOIN users u ON u.id = pv.validated_by
            WHERE s.status = 'DELIVERED' AND s.delivered_at >= now() - make_interval(hours => @hours)
              AND (cardinality(@cats) = 0 OR vt.category_id = ANY(@cats))
              AND (@saleId::uuid IS NULL OR s.id = @saleId::uuid)
            ORDER BY s.delivered_at DESC
            """, new { pid = p.Id, hours = p.WindowHours, cats = p.CategoryIds, saleId });

    /// <summary>Partenaire de l'utilisateur (grade relié à un partenaire). Un Patron peut prévisualiser un espace avec ?partnerId=.</summary>
    private static async Task<(PartnerRow? Partner, IResult? Error)> ResolvePartnerAsync(NpgsqlConnection c, CurrentUser me, Guid? requested)
    {
        var own = me.Grades.FirstOrDefault(g => g.PartnerId is not null)?.PartnerId;
        var id = own ?? (me.Has(Permissions.ConfigManage) ? requested : null);
        if (id is null) return (null, EndpointAuth.Forbidden("Ton compte n'est relié à aucun partenaire."));
        var p = (await GetPartnersAsync(c)).FirstOrDefault(x => x.Id == id);
        if (p is null || (!p.Active && own is not null)) return (null, EndpointAuth.Forbidden("Ce partenariat n'est pas actif."));
        return (p, null);
    }

    public static void MapPartners(this WebApplication app)
    {
        // ---------- Espace partenaire ----------
        app.MapGet("/api/partner/space", async (HttpContext http, NpgsqlDataSource db, ConfigService config, Guid? partnerId) =>
        {
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var (p, err) = await ResolvePartnerAsync(c, me, partnerId);
            if (err is not null) return err;

            var eligible = await EligibleAsync(c, p!);
            var history = await c.QueryAsync<ValidationRow>($"""
                SELECT pv.id, pv.partner_id, '' AS partner_name, s.id AS sale_id, s.number, s.vehicle_name, s.plate, {ClientNameSql} AS client_name,
                       s.delivered_at, pv.amount, pv.note, pv.validated_at, u.display_name AS validated_by_name
                FROM partner_validations pv
                JOIN sales s ON s.id = pv.sale_id
                JOIN clients c ON c.id = s.client_id
                LEFT JOIN users u ON u.id = pv.validated_by
                WHERE pv.partner_id = @pid AND pv.cancelled_at IS NULL
                ORDER BY pv.validated_at DESC LIMIT 200
                """, new { pid = p!.Id });

            // Nos employés : membres connectés au portail ayant un grade de la concession (ni Staff, ni partenaire).
            var grades = (await config.GetGradesAsync()).Where(g => !g.IsStaff && g.PartnerId is null && g.DiscordRoleId is not null).ToList();
            var roleIds = grades.Select(g => g.DiscordRoleId!).ToArray();
            var users = await c.QueryAsync<EmployeeRow>(
                "SELECT display_name, discord_id, avatar, role_ids FROM users WHERE role_ids && @roleIds ORDER BY display_name", new { roleIds });
            var employees = users.Select(u =>
            {
                var top = grades.Where(g => u.RoleIds.Contains(g.DiscordRoleId!)).OrderByDescending(g => g.Priority).FirstOrDefault();
                return new
                {
                    name = u.DisplayName,
                    grade = top?.Name,
                    gradePriority = top?.Priority ?? 0,
                    avatarUrl = u.Avatar is null ? null : $"https://cdn.discordapp.com/avatars/{u.DiscordId}/{u.Avatar}.png?size=64",
                };
            }).OrderByDescending(e => e.gradePriority).ThenBy(e => e.name);

            return Results.Ok(new
            {
                partner = new { p.Id, p.Name, p.DiscountPercent, p.WindowHours, p.ContractTerms, p.ClientTerms },
                eligible,
                history,
                employees,
                canValidate = me.Has(Permissions.PartnerValidate),
            });
        }).RequirePerm(Permissions.PartnerSpace);

        app.MapPost("/api/partner/sales/{saleId:guid}/validate", async (Guid saleId, ValidateInput input, HttpContext http,
            NpgsqlDataSource db, AuditService audit, DiscordNotifier notifier, PortalOptions opt) =>
        {
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var (p, err) = await ResolvePartnerAsync(c, me, null);
            if (err is not null) return err;
            if (input.Amount is < 0 or > 1_000_000_000) return EndpointAuth.Bad("Montant invalide.");
            var note = string.IsNullOrWhiteSpace(input.Note) ? null : input.Note.Trim();
            if (note is { Length: > 500 }) return EndpointAuth.Bad("Note : 500 caractères maximum.");

            var row = (await EligibleAsync(c, p!, saleId)).FirstOrDefault();
            if (row is null) return EndpointAuth.Bad($"Ce véhicule n'est pas (ou plus) éligible : livraison il y a plus de {p!.WindowHours} h ou catégorie non concernée.");
            if (row.ValidationId is not null) return EndpointAuth.Conflict("Cette customisation a déjà été validée.");

            try
            {
                await c.ExecuteAsync("""
                    INSERT INTO partner_validations (partner_id, sale_id, amount, note, validated_by)
                    VALUES (@pid, @saleId, @amount, @note, @me)
                    """, new { pid = p!.Id, saleId, amount = input.Amount is { } a ? Math.Round(a, 2) : (decimal?)null, note, me = me.Id == Guid.Empty ? (Guid?)null : me.Id });
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                return EndpointAuth.Conflict("Cette customisation a déjà été validée.");
            }

            var summary = $"**{row.VehicleName}**{(row.Plate is null ? "" : $" ({row.Plate})")} de **{row.ClientName}** — vente {SaleEndpoints.Ref(row.Number)}" +
                          (input.Amount is { } amt ? $"\nMontant : **{SaleEndpoints.Money(amt)}**" : "") +
                          (note is null ? "" : $"\nNote : {note}");
            await audit.LogAsync(me, "partner.validated", "sale", saleId.ToString(), $"🔧 Customisation validée · {p!.Name}", summary, $"/ventes/{saleId}");
            notifier.Enqueue(p!.ChannelId, DiscordNotifier.Embed($"✅ Customisation validée", summary + $"\n\n**Par :** {me.Name}",
                DiscordNotifier.ColorGreen, footer: $"{p.Name} × Big Paulie", url: $"{opt.PublicUrl}/partenaire"));
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.PartnerValidate);

        // ---------- Côté concession ----------
        app.MapGet("/api/partners", async (NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var partners = await GetPartnersAsync(c, activeOnly: true);
            var stats = (await c.QueryAsync<(Guid PartnerId, int Count30, decimal Amount30, int CountAll, decimal AmountAll)>("""
                SELECT partner_id,
                       count(*) FILTER (WHERE validated_at > now() - interval '30 days')::int,
                       coalesce(sum(amount) FILTER (WHERE validated_at > now() - interval '30 days'), 0),
                       count(*)::int, coalesce(sum(amount), 0)
                FROM partner_validations WHERE cancelled_at IS NULL GROUP BY partner_id
                """)).ToDictionary(x => x.PartnerId);
            var recent = await c.QueryAsync<ValidationRow>($"""
                SELECT pv.id, pv.partner_id, p.name AS partner_name, s.id AS sale_id, s.number, s.vehicle_name, s.plate, {ClientNameSql} AS client_name,
                       s.delivered_at, pv.amount, pv.note, pv.validated_at, u.display_name AS validated_by_name
                FROM partner_validations pv
                JOIN partners p ON p.id = pv.partner_id
                JOIN sales s ON s.id = pv.sale_id
                JOIN clients c ON c.id = s.client_id
                LEFT JOIN users u ON u.id = pv.validated_by
                WHERE pv.cancelled_at IS NULL
                ORDER BY pv.validated_at DESC LIMIT 100
                """);
            return Results.Ok(new
            {
                partners = partners.Select(p => new
                {
                    p.Id,
                    p.Name,
                    p.DiscountPercent,
                    p.WindowHours,
                    p.CategoryIds,
                    p.ClientTerms,
                    p.ContractTerms,
                    stats = stats.TryGetValue(p.Id, out var st)
                        ? new { count30 = st.Count30, amount30 = st.Amount30, countAll = st.CountAll, amountAll = st.AmountAll }
                        : new { count30 = 0, amount30 = 0m, countAll = 0, amountAll = 0m },
                }),
                recent,
            });
        }).RequirePerm(Permissions.PartnersView);

        app.MapPost("/api/partner/validations/{id:guid}/cancel", async (Guid id, CancelInput input, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            var me = http.Me();
            var reason = string.IsNullOrWhiteSpace(input.Reason) ? null : input.Reason.Trim();
            await using var c = await db.OpenConnectionAsync();
            var row = await c.QuerySingleOrDefaultAsync<(Guid SaleId, long Number, string VehicleName, string PartnerName)>("""
                UPDATE partner_validations pv SET cancelled_at = now(), cancelled_by = @me, cancel_reason = @reason
                FROM sales s, partners p
                WHERE pv.id = @id AND pv.cancelled_at IS NULL AND s.id = pv.sale_id AND p.id = pv.partner_id
                RETURNING s.id, s.number, s.vehicle_name, p.name
                """, new { id, me = me.Id == Guid.Empty ? (Guid?)null : me.Id, reason });
            if (row.SaleId == Guid.Empty) return EndpointAuth.NotFound("Validation introuvable ou déjà annulée.");
            await audit.LogAsync(me, "partner.cancelled", "sale", row.SaleId.ToString(), $"Validation partenaire annulée · {row.PartnerName}",
                $"**{row.VehicleName}** — vente {SaleEndpoints.Ref(row.Number)}" + (reason is null ? "" : $"\nRaison : {reason}"), $"/ventes/{row.SaleId}");
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.PartnersCancel);

        // ---------- Configuration ----------
        app.MapGet("/api/admin/partners", async (NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            return Results.Ok(await GetPartnersAsync(c));
        }).RequirePerm(Permissions.ConfigManage);

        app.MapPut("/api/admin/partners", async (List<PartnerRow> input, HttpContext http, NpgsqlDataSource db, ConfigService config, AuditService audit) =>
        {
            var categories = await config.GetCategoriesAsync();
            var settings = await config.GetSettingsAsync();
            foreach (var p in input)
            {
                p.Name = p.Name?.Trim() ?? "";
                if (p.Name.Length is 0 or > 60) return EndpointAuth.Bad("Chaque partenaire doit avoir un nom (60 caractères max).");
                if (p.DiscountPercent is < 1 or > 100) return EndpointAuth.Bad($"« {p.Name} » : réduction entre 1 et 100 %.");
                if (p.WindowHours is < 1 or > 720) return EndpointAuth.Bad($"« {p.Name} » : délai entre 1 et 720 heures.");
                p.CategoryIds = (p.CategoryIds ?? Array.Empty<Guid>()).Distinct().ToArray();
                if (p.CategoryIds.Any(id => categories.All(cat => cat.Id != id))) return EndpointAuth.Bad($"« {p.Name} » : catégorie inconnue.");
                p.ClientTerms = (p.ClientTerms ?? "").Trim();
                p.ContractTerms = (p.ContractTerms ?? "").Trim();
                if (p.ClientTerms.Length > 2000 || p.ContractTerms.Length > 5000) return EndpointAuth.Bad($"« {p.Name} » : texte trop long.");
                p.ChannelId = string.IsNullOrWhiteSpace(p.ChannelId) ? null : p.ChannelId.Trim();
                if (p.ChannelId is not null && !SnowflakeRegex().IsMatch(p.ChannelId)) return EndpointAuth.Bad($"« {p.Name} » : salon Discord invalide.");
                if (p.Id == Guid.Empty) p.Id = Guid.NewGuid();
            }

            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();
            foreach (var p in input)
                await c.ExecuteAsync("""
                    INSERT INTO partners (id, name, active, discount_percent, window_hours, category_ids, client_terms, contract_terms, channel_id)
                    VALUES (@Id, @Name, @Active, @DiscountPercent, @WindowHours, @CategoryIds, @ClientTerms, @ContractTerms, @ChannelId)
                    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active, discount_percent = EXCLUDED.discount_percent,
                        window_hours = EXCLUDED.window_hours, category_ids = EXCLUDED.category_ids, client_terms = EXCLUDED.client_terms,
                        contract_terms = EXCLUDED.contract_terms, channel_id = EXCLUDED.channel_id
                    """, p, tx);
            // Jamais de suppression (des validations y sont rattachées) : un partenaire retiré de la liste est désactivé.
            var ids = input.Select(p => p.Id).ToArray();
            await c.ExecuteAsync("UPDATE partners SET active = false WHERE NOT (id = ANY(@ids))", new { ids }, tx);
            await tx.CommitAsync();

            await audit.LogAsync(http.Me(), "config.partners", "config", null, "Configuration modifiée",
                "Partenariats mis à jour : " + (input.Count == 0 ? "aucun" : string.Join(", ", input.Select(p => p.Name + (p.Active ? "" : " (inactif)")))) + ".");
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.ConfigManage);
    }

    /// <summary>Après une livraison : annonce le véhicule éligible dans le salon de chaque partenaire concerné. Renvoie les noms des partenaires.</summary>
    public static async Task<List<string>> AnnounceDeliveredAsync(NpgsqlConnection c, SaleView sale, Guid categoryId, DiscordNotifier notifier, PortalOptions opt)
    {
        var names = new List<string>();
        foreach (var p in await GetPartnersAsync(c, activeOnly: true))
        {
            if (p.CategoryIds.Length > 0 && !p.CategoryIds.Contains(categoryId)) continue;
            names.Add($"{p.Name} (-{p.DiscountPercent} % pendant {p.WindowHours} h)");
            var expires = new DateTimeOffset(DateTime.UtcNow.AddHours(p.WindowHours)).ToUnixTimeSeconds();
            notifier.Enqueue(p.ChannelId, DiscordNotifier.Embed(
                "🔧 Nouveau véhicule éligible",
                $"**{sale.VehicleName}** ({sale.VehicleTypeLabel}){(sale.Plate is null ? "" : $" · plaque **{sale.Plate}**")}\n" +
                $"Client : **{sale.ClientName}**\nRéduction : **-{p.DiscountPercent} %**\nValable jusqu'au <t:{expires}:f> (<t:{expires}:R>)",
                DiscordNotifier.ColorOrange, footer: $"{p.Name} × Big Paulie", url: $"{opt.PublicUrl}/partenaire"));
        }
        return names;
    }
}
