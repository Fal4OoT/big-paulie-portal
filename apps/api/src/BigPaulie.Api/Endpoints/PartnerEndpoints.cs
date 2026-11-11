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

    /// <summary>Détail d'une customisation (tout est facultatif). Niveaux de 1 à 6, null = pièce non modifiée.</summary>
    public class CustomizationFields
    {
        public bool? Cosmetic { get; set; }
        public decimal? CosmeticAmount { get; set; }
        public bool? Performance { get; set; }
        public decimal? PerformanceAmount { get; set; }
        public int? Engine { get; set; }
        public bool? Turbo { get; set; }
        public int? Transmission { get; set; }
        public int? Suspension { get; set; }
        public int? Brakes { get; set; }
    }

    public sealed class ValidateInput : CustomizationFields
    {
        /// <summary>Montant total facturé (réduction comprise). Vide = somme cosmétique + performance.</summary>
        public decimal? Amount { get; set; }
        public string? Note { get; set; }
    }

    /// <summary>Saisie contrôlée et nettoyée (cases décochées = champs vidés).</summary>
    private sealed record Customization(decimal? Amount, string? Note, bool Cosmetic, decimal? CosmeticAmount, bool Performance,
        decimal? PerformanceAmount, int? Engine, bool Turbo, int? Transmission, int? Suspension, int? Brakes);

    private static (string? Error, Customization? Value) Normalize(ValidateInput i)
    {
        foreach (var (label, v) in new[] { ("Montant total", i.Amount), ("Montant cosmétique", i.CosmeticAmount), ("Montant performance", i.PerformanceAmount) })
            if (v is < 0 or > 1_000_000_000) return ($"{label} invalide.", null);
        foreach (var (label, v) in new[] { ("Moteur", i.Engine), ("Transmission", i.Transmission), ("Suspension", i.Suspension), ("Freins", i.Brakes) })
            if (v is < 1 or > 6) return ($"{label} : niveau entre 1 et 6.", null);
        var note = string.IsNullOrWhiteSpace(i.Note) ? null : i.Note.Trim();
        if (note is { Length: > 500 }) return ("Note : 500 caractères maximum.", null);

        static decimal? R(decimal? v) => v is { } x ? Math.Round(x, 2) : null;
        var cosmetic = i.Cosmetic == true;
        var perf = i.Performance == true;
        var cosmeticAmount = cosmetic ? R(i.CosmeticAmount) : null;
        var perfAmount = perf ? R(i.PerformanceAmount) : null;
        // Total saisi à la main, sinon somme des deux montants renseignés.
        var total = R(i.Amount) ?? (cosmeticAmount is null && perfAmount is null ? null : (cosmeticAmount ?? 0) + (perfAmount ?? 0));
        return (null, new Customization(total, note, cosmetic, cosmeticAmount, perf, perfAmount,
            perf ? i.Engine : null, perf && i.Turbo == true, perf ? i.Transmission : null, perf ? i.Suspension : null, perf ? i.Brakes : null));
    }

    /// <summary>« 🎨 Cosmétique 12 000 $ · ⚙️ Performance 35 000 $ : Moteur 4/6, Turbo, Freins 3/6 ».</summary>
    private static string Describe(Customization x)
    {
        var parts = new List<string>();
        if (x.Cosmetic) parts.Add("🎨 Cosmétique" + (x.CosmeticAmount is { } c ? $" {SaleEndpoints.Money(c)}" : ""));
        if (x.Performance)
        {
            var pieces = new List<string>();
            if (x.Engine is { } e) pieces.Add($"Moteur {e}/6");
            if (x.Turbo) pieces.Add("Turbo");
            if (x.Transmission is { } t) pieces.Add($"Transmission {t}/6");
            if (x.Suspension is { } su) pieces.Add($"Suspension {su}/6");
            if (x.Brakes is { } b) pieces.Add($"Freins {b}/6");
            parts.Add("⚙️ Performance" + (x.PerformanceAmount is { } pa ? $" {SaleEndpoints.Money(pa)}" : "")
                      + (pieces.Count > 0 ? " : " + string.Join(", ", pieces) : ""));
        }
        return string.Join("\n", parts);
    }

    private static object Params(Customization x, Guid? me) => new
    {
        amount = x.Amount,
        note = x.Note,
        cosmetic = x.Cosmetic,
        cosmeticAmount = x.CosmeticAmount,
        performance = x.Performance,
        performanceAmount = x.PerformanceAmount,
        engine = x.Engine,
        turbo = x.Turbo,
        transmission = x.Transmission,
        suspension = x.Suspension,
        brakes = x.Brakes,
        me,
    };

    /// <summary>Colonnes d'une validation (alias pv, u = validée par, uu = modifiée par).</summary>
    private const string ValidationCols = """
        pv.amount, pv.note, pv.validated_at, u.display_name AS validated_by_name,
        pv.cosmetic, pv.cosmetic_amount, pv.performance, pv.performance_amount,
        pv.engine, pv.turbo, pv.transmission, pv.suspension, pv.brakes, pv.updated_at, uu.display_name AS updated_by_name
        """;

    public sealed class CancelInput
    {
        public string? Reason { get; set; }
    }

    private sealed class EligibleRow : CustomizationFields
    {
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedByName { get; set; }
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

    private sealed class ValidationRow : CustomizationFields
    {
        public DateTime? UpdatedAt { get; set; }
        public string? UpdatedByName { get; set; }
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

    private sealed class StatsRow
    {
        [System.Text.Json.Serialization.JsonIgnore] public Guid PartnerId { get; set; }
        public int Count30 { get; set; }
        public decimal Amount30 { get; set; }
        public int CountAll { get; set; }
        public decimal AmountAll { get; set; }
        public decimal Cosmetic30 { get; set; }
        public decimal Performance30 { get; set; }
        public decimal CosmeticAll { get; set; }
        public decimal PerformanceAll { get; set; }
        public int CosmeticCount { get; set; }
        public int PerformanceCount { get; set; }
    }

    private static string Summary(string vehicle, string? plate, string client, long number, Customization x) =>
        $"**{vehicle}**{(plate is null ? "" : $" ({plate})")} de **{client}** — vente {SaleEndpoints.Ref(number)}" +
        (Describe(x) is { Length: > 0 } d ? $"\n{d}" : "") +
        (x.Amount is { } amt ? $"\nMontant total : **{SaleEndpoints.Money(amt)}**" : "") +
        (x.Note is null ? "" : $"\nNote : {x.Note}");

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
                   pv.id AS validation_id, {ValidationCols}
            FROM sales s
            JOIN clients c ON c.id = s.client_id AND c.deleted_at IS NULL
            JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
            LEFT JOIN partner_validations pv ON pv.sale_id = s.id AND pv.partner_id = @pid AND pv.cancelled_at IS NULL
            LEFT JOIN users u ON u.id = pv.validated_by
            LEFT JOIN users uu ON uu.id = pv.updated_by
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
                       s.delivered_at, {ValidationCols}
                FROM partner_validations pv
                JOIN sales s ON s.id = pv.sale_id
                JOIN clients c ON c.id = s.client_id
                LEFT JOIN users u ON u.id = pv.validated_by
                LEFT JOIN users uu ON uu.id = pv.updated_by
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
            var (invalid, x) = Normalize(input);
            if (invalid is not null) return EndpointAuth.Bad(invalid);

            var row = (await EligibleAsync(c, p!, saleId)).FirstOrDefault();
            if (row is null) return EndpointAuth.Bad($"Ce véhicule n'est pas (ou plus) éligible : livraison il y a plus de {p!.WindowHours} h ou catégorie non concernée.");
            if (row.ValidationId is not null) return EndpointAuth.Conflict("Cette customisation a déjà été validée.");

            try
            {
                var args = new DynamicParameters(Params(x!, me.Id == Guid.Empty ? null : me.Id));
                args.Add("pid", p!.Id);
                args.Add("saleId", saleId);
                await c.ExecuteAsync("""
                    INSERT INTO partner_validations (partner_id, sale_id, amount, note, validated_by, cosmetic, cosmetic_amount, performance,
                                                     performance_amount, engine, turbo, transmission, suspension, brakes)
                    VALUES (@pid, @saleId, @amount, @note, @me, @cosmetic, @cosmeticAmount, @performance,
                            @performanceAmount, @engine, @turbo, @transmission, @suspension, @brakes)
                    """, args);
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                return EndpointAuth.Conflict("Cette customisation a déjà été validée.");
            }

            var summary = Summary(row.VehicleName, row.Plate, row.ClientName, row.Number, x!);
            await audit.LogAsync(me, "partner.validated", "sale", saleId.ToString(), $"🔧 Customisation validée · {p!.Name}", summary, $"/ventes/{saleId}");
            notifier.Enqueue(p!.ChannelId, DiscordNotifier.Embed($"✅ Customisation validée", summary + $"\n\n**Par :** {me.Name}",
                DiscordNotifier.ColorGreen, footer: $"{p.Name} × Big Paulie", url: $"{opt.PublicUrl}/partenaire"));
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.PartnerValidate);

        // Correction d'une customisation déjà validée (oubli, erreur de saisie) par le garage.
        app.MapPut("/api/partner/validations/{id:guid}", async (Guid id, ValidateInput input, HttpContext http,
            NpgsqlDataSource db, AuditService audit, DiscordNotifier notifier, PortalOptions opt) =>
        {
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var (p, err) = await ResolvePartnerAsync(c, me, null);
            if (err is not null) return err;
            var (invalid, x) = Normalize(input);
            if (invalid is not null) return EndpointAuth.Bad(invalid);

            var row = await c.QuerySingleOrDefaultAsync<ValidationRow>($"""
                SELECT pv.id, pv.partner_id, '' AS partner_name, s.id AS sale_id, s.number, s.vehicle_name, s.plate, {ClientNameSql} AS client_name,
                       s.delivered_at, pv.amount, pv.note, pv.validated_at
                FROM partner_validations pv JOIN sales s ON s.id = pv.sale_id JOIN clients c ON c.id = s.client_id
                WHERE pv.id = @id AND pv.partner_id = @pid AND pv.cancelled_at IS NULL
                """, new { id, pid = p!.Id });
            if (row is null) return EndpointAuth.NotFound("Customisation introuvable (ou annulée par le Big Paulie).");

            var args = new DynamicParameters(Params(x!, me.Id == Guid.Empty ? null : me.Id));
            args.Add("id", id);
            await c.ExecuteAsync("""
                UPDATE partner_validations SET amount = @amount, note = @note, cosmetic = @cosmetic, cosmetic_amount = @cosmeticAmount,
                       performance = @performance, performance_amount = @performanceAmount, engine = @engine, turbo = @turbo,
                       transmission = @transmission, suspension = @suspension, brakes = @brakes, updated_by = @me, updated_at = now()
                WHERE id = @id
                """, args);

            var summary = Summary(row.VehicleName, row.Plate, row.ClientName, row.Number, x!);
            await audit.LogAsync(me, "partner.updated", "sale", row.SaleId.ToString(), $"🔧 Customisation modifiée · {p.Name}", summary, $"/ventes/{row.SaleId}");
            notifier.Enqueue(p.ChannelId, DiscordNotifier.Embed("✏️ Customisation modifiée", summary + $"\n\n**Par :** {me.Name}",
                DiscordNotifier.ColorSand, footer: $"{p.Name} × Big Paulie", url: $"{opt.PublicUrl}/partenaire"));
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.PartnerValidate);

        // ---------- Côté concession ----------
        app.MapGet("/api/partners", async (NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var partners = await GetPartnersAsync(c, activeOnly: true);
            var stats = (await c.QueryAsync<StatsRow>("""
                SELECT partner_id,
                       count(*) FILTER (WHERE validated_at > now() - interval '30 days')::int AS count30,
                       coalesce(sum(amount) FILTER (WHERE validated_at > now() - interval '30 days'), 0) AS amount30,
                       count(*)::int AS count_all, coalesce(sum(amount), 0) AS amount_all,
                       coalesce(sum(cosmetic_amount) FILTER (WHERE validated_at > now() - interval '30 days'), 0) AS cosmetic30,
                       coalesce(sum(performance_amount) FILTER (WHERE validated_at > now() - interval '30 days'), 0) AS performance30,
                       coalesce(sum(cosmetic_amount), 0) AS cosmetic_all, coalesce(sum(performance_amount), 0) AS performance_all,
                       count(*) FILTER (WHERE cosmetic)::int AS cosmetic_count, count(*) FILTER (WHERE performance)::int AS performance_count
                FROM partner_validations WHERE cancelled_at IS NULL GROUP BY partner_id
                """)).ToDictionary(x => x.PartnerId);
            var recent = await c.QueryAsync<ValidationRow>($"""
                SELECT pv.id, pv.partner_id, p.name AS partner_name, s.id AS sale_id, s.number, s.vehicle_name, s.plate, {ClientNameSql} AS client_name,
                       s.delivered_at, {ValidationCols}
                FROM partner_validations pv
                JOIN partners p ON p.id = pv.partner_id
                JOIN sales s ON s.id = pv.sale_id
                JOIN clients c ON c.id = s.client_id
                LEFT JOIN users u ON u.id = pv.validated_by
                LEFT JOIN users uu ON uu.id = pv.updated_by
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
                    stats = stats.TryGetValue(p.Id, out var st) ? st : new StatsRow { PartnerId = p.Id },
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
        // Ce qui sera touché par une suppression (affiché avant de confirmer).
        app.MapGet("/api/admin/partners/{id:guid}/usage", async (Guid id, NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var name = await c.ExecuteScalarAsync<string?>("SELECT name FROM partners WHERE id = @id", new { id });
            if (name is null) return EndpointAuth.NotFound("Partenaire introuvable.");
            var validations = await c.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM partner_validations WHERE partner_id = @id AND cancelled_at IS NULL", new { id });
            var grades = await c.QueryAsync<string>("SELECT name FROM grades WHERE partner_id = @id ORDER BY name", new { id });
            return Results.Ok(new { name, validations, grades });
        }).RequirePerm(Permissions.ConfigManage);

        // Suppression définitive : les validations du partenaire sont supprimées, ses grades détachés.
        app.MapDelete("/api/admin/partners/{id:guid}", async (Guid id, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();
            var name = await c.ExecuteScalarAsync<string?>("SELECT name FROM partners WHERE id = @id FOR UPDATE", new { id }, tx);
            if (name is null) return EndpointAuth.NotFound("Partenaire introuvable.");
            var validations = await c.ExecuteAsync("DELETE FROM partner_validations WHERE partner_id = @id", new { id }, tx);
            var grades = (await c.QueryAsync<string>("UPDATE grades SET partner_id = NULL WHERE partner_id = @id RETURNING name", new { id }, tx)).ToList();
            await c.ExecuteAsync("DELETE FROM partners WHERE id = @id", new { id }, tx);
            await tx.CommitAsync();

            await audit.LogAsync(http.Me(), "config.partners.deleted", "config", id.ToString(), "Partenariat supprimé",
                $"**{name}** a été supprimé" +
                (validations > 0 ? $", avec {validations} customisation(s) enregistrée(s)" : "") +
                (grades.Count > 0 ? $". Grade(s) détaché(s) : {string.Join(", ", grades)}" : "") + ".");
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.ConfigManage);

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
