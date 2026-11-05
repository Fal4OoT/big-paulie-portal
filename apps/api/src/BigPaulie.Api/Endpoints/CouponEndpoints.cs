using System.Globalization;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Infrastructure;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

/// <summary>Coupons de promotion d'un client (attribution manuelle, annulation, consultation) et progression de fidélité.</summary>
public static class CouponEndpoints
{
    public sealed class CouponInput
    {
        public int Percent { get; set; }
        public string? Reason { get; set; }
        /// <summary>AAAA-MM-JJ, facultatif.</summary>
        public string? ExpiresOn { get; set; }
    }

    public sealed class CancelInput
    {
        public string? Reason { get; set; }
    }

    private sealed class CouponRow
    {
        public Guid Id { get; set; }
        public long Number { get; set; }
        public int Percent { get; set; }
        public string Reason { get; set; } = "";
        public DateTime? ExpiresOn { get; set; }
        public string Source { get; set; } = "";
        public Guid? SourceSaleId { get; set; }
        public long? SourceSaleNumber { get; set; }
        public string? CreatedByName { get; set; }
        public DateTime CreatedAt { get; set; }
        public Guid? UsedSaleId { get; set; }
        public long? UsedSaleNumber { get; set; }
        public string? UsedByName { get; set; }
        public DateTime? UsedAt { get; set; }
        public string? CancelledByName { get; set; }
        public DateTime? CancelledAt { get; set; }
        public string? CancelReason { get; set; }
    }

    private sealed class EventRow
    {
        public Guid CouponId { get; set; }
        public string Action { get; set; } = "";
        public long? SaleNumber { get; set; }
        public string? Note { get; set; }
        public string? ActorName { get; set; }
        public DateTime At { get; set; }
    }

    public static void MapCoupons(this WebApplication app)
    {
        app.MapGet("/api/clients/{id:guid}/coupons", async (Guid id, NpgsqlDataSource db, ConfigService config, PortalOptions opt) =>
        {
            var today = CouponService.Today(opt);
            await using var c = await db.OpenConnectionAsync();
            var rows = (await c.QueryAsync<CouponRow>("""
                SELECT cp.id, cp.number, cp.percent, cp.reason, cp.expires_on, cp.source, cp.source_sale_id, ss.number AS source_sale_number,
                       cu.display_name AS created_by_name, cp.created_at,
                       cp.used_sale_id, us.number AS used_sale_number, uu.display_name AS used_by_name, cp.used_at,
                       xu.display_name AS cancelled_by_name, cp.cancelled_at, cp.cancel_reason
                FROM coupons cp
                LEFT JOIN sales ss ON ss.id = cp.source_sale_id
                LEFT JOIN sales us ON us.id = cp.used_sale_id
                LEFT JOIN users cu ON cu.id = cp.created_by
                LEFT JOIN users uu ON uu.id = cp.used_by
                LEFT JOIN users xu ON xu.id = cp.cancelled_by
                WHERE cp.client_id = @id
                ORDER BY cp.created_at DESC
                """, new { id })).ToList();

            var events = (await c.QueryAsync<EventRow>("""
                SELECT e.coupon_id, e.action, s.number AS sale_number, e.note, u.display_name AS actor_name, e.at
                FROM coupon_events e
                JOIN coupons cp ON cp.id = e.coupon_id
                LEFT JOIN sales s ON s.id = e.sale_id
                LEFT JOIN users u ON u.id = e.actor_id
                WHERE cp.client_id = @id
                ORDER BY e.at
                """, new { id })).ToLookup(e => e.CouponId);

            var settings = await config.GetSettingsAsync();
            var purchases = await c.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM sales WHERE client_id = @id AND status <> 'CANCELLED'", new { id });

            return Results.Ok(new
            {
                coupons = rows.Select(r => new
                {
                    r.Id,
                    reference = CouponService.Ref(r.Number),
                    r.Percent,
                    r.Reason,
                    expiresOn = r.ExpiresOn?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    r.Source,
                    r.SourceSaleId,
                    sourceSaleReference = r.SourceSaleNumber is { } sn ? SaleEndpoints.Ref(sn) : null,
                    r.CreatedByName,
                    r.CreatedAt,
                    r.UsedSaleId,
                    usedSaleReference = r.UsedSaleNumber is { } un ? SaleEndpoints.Ref(un) : null,
                    r.UsedByName,
                    r.UsedAt,
                    r.CancelledByName,
                    r.CancelledAt,
                    r.CancelReason,
                    status = Status(r, today),
                    events = events[r.Id].Select(e => new
                    {
                        e.Action,
                        saleReference = e.SaleNumber is { } n ? SaleEndpoints.Ref(n) : null,
                        e.Note,
                        e.ActorName,
                        e.At,
                    }),
                }),
                loyalty = new
                {
                    enabled = settings.LoyaltyEnabled,
                    every = settings.LoyaltyEvery,
                    percent = Math.Min(settings.LoyaltyPercent, settings.CouponMaxPercent),
                    expiryDays = settings.LoyaltyExpiryDays,
                    purchases,
                    progress = settings.LoyaltyEvery > 0 ? purchases % settings.LoyaltyEvery : 0,
                },
                maxPercent = settings.CouponMaxPercent,
            });
        }).RequirePerm(Permissions.ClientsView);

        app.MapPost("/api/clients/{id:guid}/coupons", async (Guid id, CouponInput input, HttpContext http, NpgsqlDataSource db,
            ConfigService config, AuditService audit, PortalOptions opt) =>
        {
            var me = http.Me();
            var settings = await config.GetSettingsAsync();
            if (input.Percent < 1 || input.Percent > settings.CouponMaxPercent)
                return EndpointAuth.Bad($"La promotion doit être entre 1 et {settings.CouponMaxPercent} %.");
            var reason = input.Reason?.Trim() ?? "";
            if (reason.Length is 0 or > 200) return EndpointAuth.Bad("Indique la raison du coupon (200 caractères max).");

            DateOnly? expires = null;
            if (!string.IsNullOrWhiteSpace(input.ExpiresOn))
            {
                if (!DateOnly.TryParseExact(input.ExpiresOn, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                    return EndpointAuth.Bad("Date d'expiration invalide.");
                if (d < CouponService.Today(opt)) return EndpointAuth.Bad("La date d'expiration est déjà passée.");
                expires = d;
            }

            await using var c = await db.OpenConnectionAsync();
            var clientJson = await c.ExecuteScalarAsync<string?>("SELECT data::text FROM clients WHERE id = @id AND deleted_at IS NULL", new { id });
            if (clientJson is null) return EndpointAuth.NotFound("Client introuvable.");

            await using var tx = await c.BeginTransactionAsync();
            var created = await c.QuerySingleAsync<(Guid Id, long Number)>("""
                INSERT INTO coupons (client_id, percent, reason, expires_on, source, created_by)
                VALUES (@id, @Percent, @reason, @expires::date, 'MANUAL', @me)
                RETURNING id, number
                """, new { id, input.Percent, reason, expires = expires?.ToDateTime(TimeOnly.MinValue), me = me.Id }, tx);
            await CouponService.EventAsync(c, tx, created.Id, "CREATED", null, reason, me.Id);
            await tx.CommitAsync();

            var clientName = ClientEndpoints.FullName(FieldValidator.ParseObject(clientJson));
            await audit.LogAsync(me, "coupon.created", "client", id.ToString(), "Coupon de promotion attribué",
                $"**{CouponService.Ref(created.Number)} · {input.Percent} %** pour **{clientName}**\nRaison : {reason}" +
                (expires is { } e ? $"\nExpire le {e:dd/MM/yyyy}" : "\nSans expiration"),
                $"/clients/{id}");
            return Results.Ok(new { id = created.Id, reference = CouponService.Ref(created.Number) });
        }).RequirePerm(Permissions.CouponsCreate);

        app.MapPost("/api/coupons/{id:guid}/cancel", async (Guid id, CancelInput input, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            var me = http.Me();
            var reason = string.IsNullOrWhiteSpace(input.Reason) ? null : input.Reason.Trim()[..Math.Min(input.Reason.Trim().Length, 200)];
            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();
            var cp = await c.QuerySingleOrDefaultAsync<(long Number, int Percent, Guid ClientId, string ClientData)>("""
                UPDATE coupons cp SET cancelled_at = now(), cancelled_by = @me, cancel_reason = @reason, cancelled_with_sale = false
                FROM clients cl
                WHERE cp.id = @id AND cl.id = cp.client_id AND cp.used_sale_id IS NULL AND cp.cancelled_at IS NULL
                RETURNING cp.number, cp.percent, cp.client_id, cl.data::text
                """, new { id, me = me.Id, reason }, tx);
            if (cp.Number == 0) return EndpointAuth.Conflict("Ce coupon est déjà utilisé ou annulé.");
            await CouponService.EventAsync(c, tx, id, "CANCELLED", null, reason, me.Id);
            await tx.CommitAsync();

            await audit.LogAsync(me, "coupon.cancelled", "client", cp.ClientId.ToString(), "Coupon de promotion annulé",
                $"**{CouponService.Ref(cp.Number)} · {cp.Percent} %** de **{ClientEndpoints.FullName(FieldValidator.ParseObject(cp.ClientData))}**" +
                (reason is null ? "" : $"\nRaison : {reason}"),
                $"/clients/{cp.ClientId}");
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.CouponsCancel);
    }

    private static string Status(CouponRow r, DateOnly today) =>
        r.CancelledAt is not null ? "CANCELLED"
        : r.UsedSaleId is not null ? "USED"
        : r.ExpiresOn is { } e && DateOnly.FromDateTime(e) < today ? "EXPIRED"
        : "AVAILABLE";
}
