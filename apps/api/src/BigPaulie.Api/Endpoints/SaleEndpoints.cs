using System.Globalization;
using System.Text.Json.Nodes;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Infrastructure;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

public static class SaleEndpoints
{
    public sealed class SaleInput
    {
        public Guid ClientId { get; set; }
        /// <summary>Véhicule du catalogue (nom uniforme). Null = véhicule hors catalogue, nom libre.</summary>
        public Guid? CatalogVehicleId { get; set; }
        public string? VehicleName { get; set; }
        public Guid VehicleTypeId { get; set; }
        public decimal? Price { get; set; }
        public bool Immediate { get; set; }
        /// <summary>Véhicule déjà en stock : la vente démarre en « Réceptionné · à livrer » (création uniquement).</summary>
        public bool InStock { get; set; }
        /// <summary>Coupon utilisé sur cet achat (un seul, non cumulable). En modification : valeur souhaitée.</summary>
        public Guid? CouponId { get; set; }
        public string? Plate { get; set; }
        public JsonObject? Data { get; set; }
    }

    public sealed class StatusInput
    {
        public string? To { get; set; }
        public string? Plate { get; set; }
        public string? Note { get; set; }
        /// <summary>Choix du cadeau à la livraison (ex : Rouge), quand le palier en propose.</summary>
        public string? GiftChoice { get; set; }
    }

    public sealed class BulkStatusInput
    {
        public Guid[] Ids { get; set; } = Array.Empty<Guid>();
        public string? To { get; set; }
    }

    public const string SelectSale = """
        SELECT s.id, s.number, s.client_id, s.catalog_vehicle_id,
               trim(coalesce(c.data->>'prenom','') || ' ' || coalesce(c.data->>'nom','')) AS client_name,
               c.data->>'telephone' AS client_phone,
               s.vehicle_name, s.vehicle_type_id, vt.label AS vehicle_type_label, vt.category_id, vc.label AS category_label, coalesce(vt.requires_plate, vc.requires_plate) AS requires_plate,
               s.price, s.immediate, s.from_stock, s.coupon_id, cp.number AS coupon_number, cp.percent AS coupon_percent, cp.reason AS coupon_reason, s.gift, s.plate, s.status, s.permit_warning, s.data::text AS data_json,
               s.seller_id, u.display_name AS seller_name, s.created_at, s.updated_at, s.delivered_at
        FROM sales s
        JOIN clients c ON c.id = s.client_id
        JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
        JOIN vehicle_categories vc ON vc.id = vt.category_id
        JOIN users u ON u.id = s.seller_id
        LEFT JOIN coupons cp ON cp.id = s.coupon_id
        """;

    public static object ToDto(SaleView s) => new
    {
        s.Id,
        s.Number,
        reference = Ref(s.Number),
        s.ClientId,
        s.ClientName,
        s.ClientPhone,
        s.CatalogVehicleId,
        s.VehicleName,
        s.VehicleTypeId,
        s.VehicleTypeLabel,
        s.CategoryId,
        s.CategoryLabel,
        s.RequiresPlate,
        s.Price,
        s.Immediate,
        s.FromStock,
        s.CouponId,
        couponReference = s.CouponNumber is { } cn ? CouponService.Ref(cn) : null,
        s.CouponPercent,
        s.CouponReason,
        s.Gift,
        s.Plate,
        s.Status,
        s.PermitWarning,
        data = FieldValidator.ParseObject(s.DataJson),
        s.SellerId,
        s.SellerName,
        s.CreatedAt,
        s.UpdatedAt,
        s.DeliveredAt,
    };

    public static string Ref(long number) => $"BP-{number:0000}";

    public static string Money(decimal v) => v.ToString("N0", CultureInfo.GetCultureInfo("fr-FR")) + " $";

    public static string? NormalizePlate(string? plate)
    {
        if (string.IsNullOrWhiteSpace(plate)) return null;
        var p = plate.Trim().ToUpperInvariant();
        return p.Length > 16 ? null : p;
    }

    public static void MapSales(this WebApplication app)
    {
        var g = app.MapGroup("/api/sales");

        g.MapGet("/", async (NpgsqlDataSource db, string? status, string? q, Guid? clientId, int? limit) =>
        {
            var p = new DynamicParameters();
            p.Add("limit", Math.Clamp(limit ?? 200, 1, 1000));
            var where = "WHERE c.deleted_at IS NULL";
            if (!string.IsNullOrWhiteSpace(status))
            {
                var codes = status.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                                  .Where(SaleStatus.IsValid).ToArray();
                if (codes.Length > 0) { where += " AND s.status = ANY(@codes)"; p.Add("codes", codes); }
            }
            if (clientId is not null) { where += " AND s.client_id = @clientId"; p.Add("clientId", clientId); }
            where += ClientEndpoints.SearchClause(
                "lower(s.vehicle_name || ' ' || coalesce(s.plate,'') || ' bp-' || lpad(s.number::text, 4, '0') || ' ' || c.search_text)", q, p);

            await using var c = await db.OpenConnectionAsync();
            var rows = await c.QueryAsync<SaleView>($"{SelectSale} {where} ORDER BY s.created_at DESC LIMIT @limit", p);
            return Results.Ok(rows.Select(ToDto));
        }).RequirePerm(Permissions.SalesView);

        g.MapGet("/{id:guid}", async (Guid id, NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var sale = await c.QuerySingleOrDefaultAsync<SaleView>($"{SelectSale} WHERE s.id = @id", new { id });
            if (sale is null) return EndpointAuth.NotFound("Vente introuvable.");
            var partnerValidations = await c.QueryAsync("""
                SELECT pv.id, p.name AS partner_name, pv.amount, pv.note, pv.validated_at, u.display_name AS validated_by_name
                FROM partner_validations pv JOIN partners p ON p.id = pv.partner_id LEFT JOIN users u ON u.id = pv.validated_by
                WHERE pv.sale_id = @id AND pv.cancelled_at IS NULL ORDER BY pv.validated_at
                """, new { id });
            var events = await c.QueryAsync<SaleEventView>("""
                SELECT e.id, e.action, e.from_status, e.to_status, e.note, e.actor_id, u.display_name AS actor_name, e.at
                FROM sale_events e LEFT JOIN users u ON u.id = e.actor_id
                WHERE e.sale_id = @id ORDER BY e.at, e.id
                """, new { id });
            return Results.Ok(new
            {
                sale = ToDto(sale),
                events,
                partnerValidations = partnerValidations.Select(v => new
                {
                    id = (Guid)v.id,
                    partnerName = (string)v.partner_name,
                    amount = (decimal?)v.amount,
                    note = (string?)v.note,
                    validatedAt = (DateTime)v.validated_at,
                    validatedByName = (string?)v.validated_by_name,
                }),
            });
        }).RequirePerm(Permissions.SalesView);

        g.MapPost("/", async (SaleInput input, HttpContext http, NpgsqlDataSource db, ConfigService config,
            AuditService audit, PortalOptions opt) =>
        {
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var (name, catalogId, nameError) = await ResolveVehicleNameAsync(c, input, null);
            if (nameError is not null) return EndpointAuth.Bad(nameError);
            if (input.Price is null || input.Price < 0 || input.Price > 1_000_000_000) return EndpointAuth.Bad("Prix de vente invalide.");

            var types = await config.GetVehicleTypesAsync();
            var type = types.FirstOrDefault(t => t.Id == input.VehicleTypeId && t.Active);
            if (type is null) return EndpointAuth.Bad("Type de véhicule invalide.");

            var clientJson = await c.ExecuteScalarAsync<string?>("SELECT data::text FROM clients WHERE id = @id AND deleted_at IS NULL", new { id = input.ClientId });
            if (clientJson is null) return EndpointAuth.NotFound("Client introuvable.");
            var client = FieldValidator.ParseObject(clientJson);

            var fields = await config.GetFieldsAsync("sale");
            var v = await FieldValidator.ValidateAsync(fields, input.Data, c);
            if (v.Errors.Count > 0) return EndpointAuth.Bad(string.Join("\n", v.Errors));

            var warning = HasPermitWarning(type, client);

            // En stock : rien à commander ni à aller chercher, la vente est directement à livrer.
            var inStock = input.InStock;
            var immediate = !inStock && input.Immediate;
            var status = inStock ? SaleStatus.Received : SaleStatus.ToOrder;
            var note = inStock ? "Véhicule en stock : directement à livrer"
                     : immediate ? "Client veut le véhicule immédiatement" : null;

            await using var tx = await c.BeginTransactionAsync();
            var created = await c.QuerySingleAsync<(Guid Id, long Number)>("""
                INSERT INTO sales (client_id, catalog_vehicle_id, vehicle_name, vehicle_type_id, price, immediate, from_stock, status, permit_warning, data, seller_id)
                VALUES (@clientId, @catalogId, @name, @typeId, @price, @immediate, @inStock, @status, @warning, @data::jsonb, @me)
                RETURNING id, number
                """, new { clientId = input.ClientId, catalogId, name, typeId = type.Id, price = Math.Round(input.Price.Value, 2), immediate, inStock, status, warning, data = v.Data.ToJsonString(), me = me.Id }, tx);
            await c.ExecuteAsync("""
                INSERT INTO sale_events (sale_id, action, to_status, note, actor_id)
                VALUES (@id, 'CREATED', @status, @note, @me)
                """, new { id = created.Id, status, note, me = me.Id }, tx);

            var today = CouponService.Today(opt);
            string? couponLabel = null;
            if (input.CouponId is { } couponId)
            {
                var (couponError, label) = await CouponService.ApplyAsync(c, tx, couponId, created.Id, input.ClientId, me.Id, today);
                if (couponError is not null) return EndpointAuth.Bad(couponError); // la transaction est annulée
                couponLabel = label;
            }
            var settingsForLoyalty = await config.GetSettingsAsync();
            var loyaltyLabel = await CouponService.LoyaltyOnSaleCreatedAsync(c, tx, settingsForLoyalty, input.ClientId, created.Id, me.Id, today);
            var sponsorReward = await CouponService.ReferralOnSaleCreatedAsync(c, tx, settingsForLoyalty, input.ClientId, created.Id, me.Id, today);
            await tx.CommitAsync();

            var reference = Ref(created.Number);
            var clientName = ClientEndpoints.FullName(client);
            var categories = await config.GetCategoriesAsync();
            var categoryLabel = categories.FirstOrDefault(x => x.Id == type.CategoryId)?.Label ?? "";

            await audit.LogAsync(me, "sale.created", "sale", created.Id.ToString(), $"Nouvelle vente {reference}",
                $"**{name}** ({type.Label} · {categoryLabel}) pour **{clientName}** — {Money(input.Price.Value)}" +
                (inStock ? "\n📦 **En stock** : directement à livrer" : immediate ? "\n⚡ **Immédiat**" : "\n🕒 Prochaine tournée") +
                (warning ? "\n⚠️ Permis correspondant non renseigné" : "") +
                (couponLabel is null ? "" : $"\n🏷️ Coupon utilisé : **{couponLabel}**"),
                $"/ventes/{created.Id}");
            if (loyaltyLabel is not null)
                await audit.LogAsync(me, "coupon.created", "client", input.ClientId.ToString(), "Coupon de fidélité généré",
                    $"**{loyaltyLabel}** pour **{clientName}** grâce à la vente {reference}.", $"/clients/{input.ClientId}");
            if (sponsorReward is not null)
                await audit.LogAsync(me, "coupon.created", "client", sponsorReward.SponsorId.ToString(), "Coupon de parrainage généré",
                    $"**{sponsorReward.Label}** pour **{sponsorReward.SponsorName}** : premier achat de son filleul **{clientName}** ({reference}).",
                    $"/clients/{sponsorReward.SponsorId}");

            // Vente immédiate : le tableau de tournée est reposté avec mention du rôle « immédiat ».
            var board = http.RequestServices.GetRequiredService<TourBoardService>();
            if (immediate) board.RequestRepost(TourBoardService.RepostReason.Immediate, $"{reference} · {name} ({type.Label}) pour {clientName}");
            else board.RequestRefresh();

            return Results.Ok(new { id = created.Id, number = created.Number, reference, status, permitWarning = warning, loyaltyCoupon = loyaltyLabel });
        }).RequirePerm(Permissions.SalesCreate);

        g.MapPut("/{id:guid}", async (Guid id, SaleInput input, HttpContext http, NpgsqlDataSource db, ConfigService config, AuditService audit, PortalOptions opt) =>
        {
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var sale = await c.QuerySingleOrDefaultAsync<SaleView>($"{SelectSale} WHERE s.id = @id", new { id });
            if (sale is null) return EndpointAuth.NotFound("Vente introuvable.");

            var (name, catalogId, nameError) = await ResolveVehicleNameAsync(c, input, sale);
            if (nameError is not null) return EndpointAuth.Bad(nameError);
            if (input.Price is null || input.Price < 0 || input.Price > 1_000_000_000) return EndpointAuth.Bad("Prix de vente invalide.");

            var types = await config.GetVehicleTypesAsync();
            // Un type désactivé reste accepté s'il est déjà celui de la vente.
            var type = types.FirstOrDefault(t => t.Id == input.VehicleTypeId && (t.Active || t.Id == sale.VehicleTypeId));
            if (type is null) return EndpointAuth.Bad("Type de véhicule invalide.");

            var categories = await config.GetCategoriesAsync();
            var requiresPlate = type.RequiresPlate ?? categories.FirstOrDefault(x => x.Id == type.CategoryId)?.RequiresPlate ?? true;

            string? plate = sale.Plate;
            if (!requiresPlate) plate = null;
            else if (sale.Status == SaleStatus.Delivered)
            {
                plate = NormalizePlate(input.Plate);
                if (plate is null) return EndpointAuth.Bad("Plaque obligatoire pour une vente livrée (16 caractères max).");
            }

            var fields = await config.GetFieldsAsync("sale");
            var v = await FieldValidator.ValidateAsync(fields, input.Data, c, FieldValidator.ParseObject(sale.DataJson));
            if (v.Errors.Count > 0) return EndpointAuth.Bad(string.Join("\n", v.Errors));

            var clientJson = await c.ExecuteScalarAsync<string>("SELECT data::text FROM clients WHERE id = @id", new { id = sale.ClientId });
            var warning = HasPermitWarning(type, FieldValidator.ParseObject(clientJson));

            var changes = new List<string>();
            if (sale.VehicleName != name || sale.CatalogVehicleId != catalogId)
                changes.Add($"véhicule : {sale.VehicleName} → {name}{(catalogId is null ? " (hors catalogue)" : "")}");
            if (sale.VehicleTypeId != type.Id) changes.Add($"type : {sale.VehicleTypeLabel} → {type.Label}");
            if (sale.Price != Math.Round(input.Price.Value, 2)) changes.Add($"prix : {Money(sale.Price)} → {Money(input.Price.Value)}");
            if (sale.Immediate != input.Immediate) changes.Add(input.Immediate ? "passée en immédiat" : "n'est plus immédiate");
            if (sale.Plate != plate) changes.Add($"plaque : {sale.Plate ?? "—"} → {plate}");
            if (FieldValidator.ParseObject(sale.DataJson).ToJsonString() != v.Data.ToJsonString()) changes.Add("informations complémentaires");
            var couponChanged = input.CouponId != sale.CouponId;
            if (couponChanged && input.CouponId is not null && sale.Status == SaleStatus.Cancelled)
                return EndpointAuth.Bad("Impossible d'utiliser un coupon sur une vente annulée.");
            if (changes.Count == 0 && !couponChanged) return Results.Ok(new { id });

            try
            {
                await using var tx = await c.BeginTransactionAsync();
                await c.ExecuteAsync("""
                    UPDATE sales SET catalog_vehicle_id = @catalogId, vehicle_name = @name, vehicle_type_id = @typeId, price = @price, immediate = @immediate,
                                     plate = @plate, permit_warning = @warning, data = @data::jsonb, updated_at = now()
                    WHERE id = @id
                    """, new { id, catalogId, name, typeId = type.Id, price = Math.Round(input.Price.Value, 2), immediate = input.Immediate, plate, warning, data = v.Data.ToJsonString() }, tx);
                if (couponChanged)
                {
                    var released = await CouponService.ReleaseAsync(c, tx, id, me.Id, $"Retiré de la vente {Ref(sale.Number)}");
                    if (released is not null) changes.Add($"coupon {released} retiré");
                    if (input.CouponId is { } newCoupon)
                    {
                        var (couponError, label) = await CouponService.ApplyAsync(c, tx, newCoupon, id, sale.ClientId, me.Id, CouponService.Today(opt));
                        if (couponError is not null) return EndpointAuth.Bad(couponError); // la transaction est annulée
                        changes.Add($"coupon {label} utilisé");
                    }
                }
                await c.ExecuteAsync("INSERT INTO sale_events (sale_id, action, note, actor_id) VALUES (@id, 'EDITED', @note, @me)",
                    new { id, note = string.Join(" · ", changes), me = me.Id }, tx);
                await tx.CommitAsync();
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                return EndpointAuth.Conflict($"La plaque {plate} est déjà attribuée à une autre vente.");
            }

            await audit.LogAsync(me, "sale.updated", "sale", id.ToString(), $"Vente {Ref(sale.Number)} modifiée",
                $"**{name}** pour **{sale.ClientName}** — " + string.Join(" · ", changes), $"/ventes/{id}");
            http.RefreshTourBoard();
            return Results.Ok(new { id });
        }).RequirePerm(Permissions.SalesEdit);

        g.MapPost("/{id:guid}/status", async (Guid id, StatusInput input, HttpContext http, NpgsqlDataSource db,
            ConfigService config, AuditService audit, DiscordNotifier notifier, PortalOptions opt) =>
        {
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var settings = await config.GetSettingsAsync();
            var result = await ChangeStatusAsync(c, me, id, input.To, input.Plate, input.Note, settings, giftChoice: input.GiftChoice);
            if (result.Error is not null) return result.Error;

            var s = result.Sale!;
            // Livraison : le véhicule devient éligible aux partenariats (annonce dans le salon de chaque partenaire).
            if (input.To == SaleStatus.Delivered)
                foreach (var partner in await PartnerEndpoints.AnnounceDeliveredAsync(c, s, s.CategoryId, notifier, opt))
                    (result.Notes ?? new()).Add($"🔧 Éligible partenariat : {partner}");
            await audit.LogAsync(me, input.To == SaleStatus.Cancelled ? "sale.cancelled" : "sale.status", "sale", id.ToString(),
                $"Vente {Ref(s.Number)} : {settings.StatusLabel(result.From!)} → {settings.StatusLabel(input.To!)}",
                $"**{s.VehicleName}** ({s.VehicleTypeLabel}) pour **{s.ClientName}**" +
                (input.To == SaleStatus.Delivered ? (result.Plate is null ? "\nSans plaque" : $"\nPlaque : **{result.Plate}**") : "") +
                (result.Gift is null ? "" : $"\n🎁 Cadeau à remettre : **{result.Gift}**") +
                (string.IsNullOrWhiteSpace(input.Note) ? "" : $"\nNote : {input.Note.Trim()}") +
                (result.Notes is { Count: > 0 } n ? "\n" + string.Join("\n", n) : ""),
                $"/ventes/{id}");
            http.RefreshTourBoard();
            return Results.Ok(new { id, status = input.To, gift = result.Gift });
        }).RequirePerm(Permissions.SalesView); // les droits précis sont vérifiés selon la transition

        // Actions groupées de la page Tournée (uniquement vers l'avant, sans livraison).
        g.MapPost("/bulk-status", async (BulkStatusInput input, HttpContext http, NpgsqlDataSource db, ConfigService config, AuditService audit) =>
        {
            var me = http.Me();
            if (input.To is not (SaleStatus.ToFetch or SaleStatus.Received))
                return EndpointAuth.Bad("Action groupée possible uniquement vers « À chercher » ou « Réceptionné ».");
            if (input.Ids.Length == 0 || input.Ids.Length > 200) return EndpointAuth.Bad("Sélection vide ou trop grande.");

            var settings = await config.GetSettingsAsync();
            await using var c = await db.OpenConnectionAsync();
            var done = new List<SaleView>();
            var errors = new List<string>();
            foreach (var id in input.Ids.Distinct())
            {
                var r = await ChangeStatusAsync(c, me, id, input.To, null, "Action groupée (tournée)", settings, forwardOnly: true);
                if (r.Error is not null) errors.Add(id.ToString());
                else done.Add(r.Sale!);
            }

            if (done.Count > 0)
            {
                var lines = done.Select(s => $"{Ref(s.Number)} · {s.VehicleName} ({s.VehicleTypeLabel}) — {s.ClientName}").ToList();
                await audit.LogAsync(me, "sale.status", "sale", null,
                    $"Tournée : {done.Count} vente(s) → {settings.StatusLabel(input.To)}",
                    DiscordNotifier.BulletList(lines, 3500), "/tournee");
            }
            if (done.Count > 0) http.RefreshTourBoard();
            return Results.Ok(new { updated = done.Count, failed = errors.Count });
        }).RequirePerm(Permissions.SalesAdvance);
    }

    /// <summary>
    /// Nom du véhicule : celui du catalogue quand un véhicule est choisi (noms uniformes pour l'analyse),
    /// sinon le nom libre saisi (hors catalogue).
    /// </summary>
    private static async Task<(string Name, Guid? CatalogId, string? Error)> ResolveVehicleNameAsync(
        NpgsqlConnection c, SaleInput input, SaleView? current)
    {
        if (input.CatalogVehicleId is { } cid)
        {
            // Un véhicule retiré du catalogue reste accepté s'il est déjà celui de la vente.
            var cvName = await c.ExecuteScalarAsync<string?>(
                "SELECT name FROM catalog_vehicles WHERE id = @cid AND (active OR @cid = @currentId)",
                new { cid, currentId = current?.CatalogVehicleId });
            return cvName is null ? ("", null, "Véhicule introuvable dans le catalogue.") : (cvName, cid, null);
        }

        var name = input.VehicleName?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > 120) return ("", null, "Nom du véhicule obligatoire (120 caractères max).");
        return (name, null, null);
    }

    public sealed record ChangeResult(IResult? Error, SaleView? Sale = null, string? From = null, string? Plate = null, List<string>? Notes = null, string? Gift = null);

    /// <summary>Change le statut d'une vente en vérifiant le droit correspondant à la transition.</summary>
    public static async Task<ChangeResult> ChangeStatusAsync(NpgsqlConnection c, CurrentUser me, Guid id, string? to,
        string? plateInput, string? note, PortalSettings settings, bool forwardOnly = false, string? giftChoice = null)
    {
        if (!SaleStatus.IsValid(to)) return new(EndpointAuth.Bad("Statut inconnu."));

        var sale = await c.QuerySingleOrDefaultAsync<SaleView>($"{SelectSale} WHERE s.id = @id", new { id });
        if (sale is null) return new(EndpointAuth.NotFound("Vente introuvable."));
        var from = sale.Status;
        if (from == to) return new(EndpointAuth.Bad($"La vente est déjà « {settings.StatusLabel(to!)} »."));

        // Droit requis selon la transition.
        string perm;
        if (to == SaleStatus.Cancelled || from == SaleStatus.Cancelled) perm = Permissions.SalesCancel;
        else if (SaleStatus.Rank(to!) > SaleStatus.Rank(from)) perm = Permissions.SalesAdvance;
        else perm = Permissions.SalesRevert;

        if (forwardOnly && perm != Permissions.SalesAdvance) return new(EndpointAuth.Bad("Transition non autorisée ici."));
        if (!me.Has(perm)) return new(EndpointAuth.Forbidden());

        if (from == SaleStatus.Cancelled && to != SaleStatus.ToOrder)
            return new(EndpointAuth.Bad("Une vente annulée se rétablit en « À commander »."));

        string? plate = sale.Plate;
        if (!sale.RequiresPlate) plate = null; // maritime / aérien : pas de plaque
        else if (to == SaleStatus.Delivered)
        {
            plate = NormalizePlate(plateInput) ?? sale.Plate;
            if (plate is null) return new(EndpointAuth.Bad("La plaque est obligatoire pour passer la vente en livrée."));
        }

        // Cadeau selon le prix de vente, figé au moment de la livraison.
        string? gift = null;
        if (to == SaleStatus.Delivered && settings.GiftFor(sale.Price) is { } tier)
        {
            gift = tier.Label;
            if (tier.Choices.Count > 0)
            {
                var choice = tier.Choices.FirstOrDefault(ch => string.Equals(ch, giftChoice?.Trim(), StringComparison.OrdinalIgnoreCase));
                if (choice is null) return new(EndpointAuth.Bad($"Cadeau : choisis {string.Join(" ou ", tier.Choices)} pour « {tier.Label} »."));
                gift = $"{tier.Label} ({choice})";
            }
        }

        var action = to == SaleStatus.Cancelled ? "CANCELLED" : from == SaleStatus.Cancelled ? "RESTORED" : "STATUS";
        var notes = new List<string>();
        try
        {
            await using var tx = await c.BeginTransactionAsync();
            var updated = await c.ExecuteAsync("""
                UPDATE sales SET status = @to, plate = @plate, updated_at = now(), gift = @gift,
                       delivered_at = CASE WHEN @to = 'DELIVERED' THEN now() WHEN @to <> 'CANCELLED' THEN NULL ELSE delivered_at END
                WHERE id = @id AND status = @from
                """, new { id, to, from, plate, gift }, tx);
            if (updated == 0)
            {
                await tx.RollbackAsync();
                return new(EndpointAuth.Conflict("La vente vient d'être modifiée par quelqu'un d'autre, recharge la page."));
            }
            await c.ExecuteAsync("""
                INSERT INTO sale_events (sale_id, action, from_status, to_status, note, actor_id)
                VALUES (@id, @action, @from, @to, @note, @me)
                """, new { id, action, from, to, note = Clean(gift is null ? note : $"🎁 {gift}" + (string.IsNullOrWhiteSpace(note) ? "" : $" · {note}"), 500), me = me.Id }, tx);

            // Coupons : une vente annulée rend son coupon et retire le coupon de fidélité qu'elle avait généré.
            if (to == SaleStatus.Cancelled)
            {
                if (await CouponService.ReleaseAsync(c, tx, id, me.Id, $"Vente {Ref(sale.Number)} annulée") is { } released)
                    notes.Add($"🏷️ Coupon {released} de nouveau disponible");
                foreach (var generated in await CouponService.GeneratedOnSaleCancelledAsync(c, tx, id, me.Id))
                    notes.Add($"🏷️ Coupon {generated} (généré par cette vente) annulé");
            }
            else if (from == SaleStatus.Cancelled)
            {
                foreach (var restored in await CouponService.GeneratedOnSaleRestoredAsync(c, tx, id, me.Id))
                    notes.Add($"🏷️ Coupon {restored} rétabli");
            }
            await tx.CommitAsync();
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return new(EndpointAuth.Conflict($"La plaque {plate} est déjà attribuée à une autre vente."));
        }

        sale.Status = to!;
        sale.Plate = plate;
        sale.Gift = gift;
        return new(null, sale, from, plate, notes, gift);
    }

    private static string? Clean(string? s, int max)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        s = s.Trim();
        return s.Length > max ? s[..max] : s;
    }

    public static bool HasPermitWarning(VehicleType type, JsonObject client) =>
        !string.IsNullOrEmpty(type.PermitFieldKey) && string.IsNullOrEmpty(FieldValidator.GetString(client, type.PermitFieldKey));

    /// <summary>Recalcule l'avertissement « permis manquant » des ventes en cours d'un client.</summary>
    public static async Task RefreshPermitWarningsAsync(NpgsqlConnection c, Guid clientId, JsonObject client)
    {
        var rows = await c.QueryAsync<(Guid Id, string? PermitFieldKey)>("""
            SELECT s.id, vt.permit_field_key FROM sales s JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
            WHERE s.client_id = @clientId AND s.status IN ('TO_ORDER','TO_FETCH','RECEIVED')
            """, new { clientId });
        foreach (var (saleId, key) in rows)
        {
            var warning = !string.IsNullOrEmpty(key) && string.IsNullOrEmpty(FieldValidator.GetString(client, key));
            await c.ExecuteAsync("UPDATE sales SET permit_warning = @warning WHERE id = @saleId AND permit_warning <> @warning", new { saleId, warning });
        }
    }
}
