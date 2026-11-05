using BigPaulie.Api.Auth;
using BigPaulie.Api.Infrastructure;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

/// <summary>
/// Parrainage : un client (filleul) peut avoir un seul parrain, lui-même client.
/// Le filleul reçoit son coupon à l'enregistrement (utilisable sur son premier achat),
/// le parrain reçoit le sien au premier achat du filleul.
/// </summary>
public static class ReferralEndpoints
{
    public sealed class SponsorInput
    {
        public Guid SponsorId { get; set; }
    }

    private sealed class ReferralRow
    {
        public Guid? SponsorId { get; set; }
        public string? SponsorJson { get; set; }
        public DateTime? SponsorSetAt { get; set; }
        public string? SponsorSetByName { get; set; }
        public string DataJson { get; set; } = "{}";
    }

    private sealed class GodchildRow
    {
        public Guid Id { get; set; }
        public string DataJson { get; set; } = "{}";
        public DateTime? SponsorSetAt { get; set; }
        public int Purchases { get; set; }
        public bool SponsorRewarded { get; set; }
    }

    private const string PurchasesSql = "SELECT count(*)::int FROM sales WHERE client_id = @id AND status <> 'CANCELLED'";

    /// <summary>Raison pour laquelle le parrain ne peut plus être changé ni retiré (null = possible).</summary>
    private static async Task<string?> LockReasonAsync(NpgsqlConnection c, NpgsqlTransaction? tx, Guid godchildId)
    {
        var state = await c.QuerySingleAsync<(bool GodchildUsed, bool SponsorRewarded)>("""
            SELECT EXISTS (SELECT 1 FROM coupons WHERE source = 'REFERRAL' AND referral_role = 'GODCHILD'
                           AND referral_godchild_id = @godchildId AND used_sale_id IS NOT NULL),
                   EXISTS (SELECT 1 FROM coupons WHERE source = 'REFERRAL' AND referral_role = 'SPONSOR'
                           AND referral_godchild_id = @godchildId AND cancelled_at IS NULL)
            """, new { godchildId }, tx);
        if (state.SponsorRewarded) return "Le parrain a déjà reçu son coupon : le parrainage est définitif.";
        if (state.GodchildUsed) return "Le filleul a déjà utilisé son coupon de parrainage : le parrainage est définitif.";
        return null;
    }

    /// <summary>Annule le coupon du filleul s'il n'a pas servi (parrainage retiré ou changé).</summary>
    private static async Task<string?> CancelGodchildCouponAsync(NpgsqlConnection c, NpgsqlTransaction tx, Guid godchildId, Guid actorId, string reason)
    {
        var cp = await c.QuerySingleOrDefaultAsync<(Guid Id, long Number)>("""
            UPDATE coupons SET cancelled_at = now(), cancelled_by = @actor, cancel_reason = @reason
            WHERE source = 'REFERRAL' AND referral_role = 'GODCHILD' AND referral_godchild_id = @godchildId
              AND used_sale_id IS NULL AND cancelled_at IS NULL
            RETURNING id, number
            """, new { godchildId, actor = actorId == Guid.Empty ? (Guid?)null : actorId, reason }, tx);
        if (cp.Id == Guid.Empty) return null;
        await CouponService.EventAsync(c, tx, cp.Id, "CANCELLED", null, reason, actorId);
        return CouponService.Ref(cp.Number);
    }

    public static void MapReferrals(this WebApplication app)
    {
        app.MapGet("/api/clients/{id:guid}/referral", async (Guid id, NpgsqlDataSource db, ConfigService config) =>
        {
            var settings = await config.GetSettingsAsync();
            await using var c = await db.OpenConnectionAsync();
            var row = await c.QuerySingleOrDefaultAsync<ReferralRow>("""
                SELECT cl.sponsor_id, sp.data::text AS sponsor_json, cl.sponsor_set_at, u.display_name AS sponsor_set_by_name, cl.data::text AS data_json
                FROM clients cl
                LEFT JOIN clients sp ON sp.id = cl.sponsor_id
                LEFT JOIN users u ON u.id = cl.sponsor_set_by
                WHERE cl.id = @id AND cl.deleted_at IS NULL
                """, new { id });
            if (row is null) return EndpointAuth.NotFound("Client introuvable.");

            var godchildren = await c.QueryAsync<GodchildRow>("""
                SELECT g.id, g.data::text AS data_json, g.sponsor_set_at,
                       (SELECT count(*)::int FROM sales s WHERE s.client_id = g.id AND s.status <> 'CANCELLED') AS purchases,
                       EXISTS (SELECT 1 FROM coupons cp WHERE cp.source = 'REFERRAL' AND cp.referral_role = 'SPONSOR'
                               AND cp.referral_godchild_id = g.id AND cp.cancelled_at IS NULL) AS sponsor_rewarded
                FROM clients g
                WHERE g.sponsor_id = @id AND g.deleted_at IS NULL
                ORDER BY g.sponsor_set_at
                """, new { id });
            var purchases = await c.ExecuteScalarAsync<int>(PurchasesSql, new { id });
            var lockReason = row.SponsorId is null ? null : await LockReasonAsync(c, null, id);

            return Results.Ok(new
            {
                enabled = settings.ReferralEnabled,
                sponsor = row.SponsorId is { } sid
                    ? new { id = sid, name = CouponService.FullName(row.SponsorJson ?? "{}") }
                    : null,
                sponsorSetAt = row.SponsorSetAt,
                sponsorSetByName = row.SponsorSetByName,
                purchases,
                canSetSponsor = settings.ReferralEnabled && row.SponsorId is null && purchases == 0,
                lockReason,
                godchildren = godchildren.Select(g => new
                {
                    g.Id,
                    name = CouponService.FullName(g.DataJson),
                    since = g.SponsorSetAt,
                    g.Purchases,
                    g.SponsorRewarded,
                }),
                maxGodchildren = settings.ReferralMaxGodchildren,
                sponsorPercent = Math.Min(settings.ReferralSponsorPercent, settings.CouponMaxPercent),
                godchildPercent = Math.Min(settings.ReferralGodchildPercent, settings.CouponMaxPercent),
            });
        }).RequirePerm(Permissions.ClientsView);

        app.MapPut("/api/clients/{id:guid}/sponsor", async (Guid id, SponsorInput input, HttpContext http, NpgsqlDataSource db,
            ConfigService config, AuditService audit, PortalOptions opt) =>
        {
            var me = http.Me();
            var settings = await config.GetSettingsAsync();
            if (!settings.ReferralEnabled) return EndpointAuth.Bad("Le parrainage n'est pas activé (Configuration → Coupons & fidélité).");
            if (input.SponsorId == id) return EndpointAuth.Bad("Un client ne peut pas être son propre parrain.");

            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();

            var godchild = await c.QuerySingleOrDefaultAsync<(string DataJson, Guid? SponsorId)>(
                "SELECT data::text, sponsor_id FROM clients WHERE id = @id AND deleted_at IS NULL FOR UPDATE", new { id }, tx);
            if (godchild.DataJson is null) return EndpointAuth.NotFound("Client introuvable.");
            var sponsorJson = await c.ExecuteScalarAsync<string?>(
                "SELECT data::text FROM clients WHERE id = @sid AND deleted_at IS NULL", new { sid = input.SponsorId }, tx);
            if (sponsorJson is null) return EndpointAuth.Bad("Le parrain doit être un client enregistré.");
            if (godchild.SponsorId == input.SponsorId) return EndpointAuth.Bad("Ce client a déjà ce parrain.");

            if (await c.ExecuteScalarAsync<int>(PurchasesSql, new { id }, tx) > 0)
                return EndpointAuth.Bad("Le parrainage doit être enregistré avant le premier achat du filleul.");

            // Aucun parrainage croisé, même en chaîne (A → B → C → A).
            var cycle = await c.ExecuteScalarAsync<bool>("""
                WITH RECURSIVE chain AS (
                    SELECT id, sponsor_id FROM clients WHERE id = @sid
                    UNION
                    SELECT cl.id, cl.sponsor_id FROM clients cl JOIN chain ON cl.id = chain.sponsor_id
                )
                SELECT EXISTS (SELECT 1 FROM chain WHERE id = @id)
                """, new { sid = input.SponsorId, id }, tx);
            if (cycle) return EndpointAuth.Bad("Parrainage croisé impossible : ce client fait déjà partie des parrains de ce parrain.");

            if (settings.ReferralMaxGodchildren is { } max)
            {
                var count = await c.ExecuteScalarAsync<int>(
                    "SELECT count(*)::int FROM clients WHERE sponsor_id = @sid AND deleted_at IS NULL AND id <> @id", new { sid = input.SponsorId, id }, tx);
                if (count >= max) return EndpointAuth.Bad($"Ce parrain a déjà {count} filleul(s), le maximum est {max}.");
            }

            string? replacedCoupon = null;
            if (godchild.SponsorId is not null)
            {
                if (await LockReasonAsync(c, tx, id) is { } locked) return EndpointAuth.Conflict(locked);
                replacedCoupon = await CancelGodchildCouponAsync(c, tx, id, me.Id, "Parrain changé");
            }

            await c.ExecuteAsync("UPDATE clients SET sponsor_id = @sid, sponsor_set_at = now(), sponsor_set_by = @me WHERE id = @id",
                new { sid = input.SponsorId, me = me.Id == Guid.Empty ? (Guid?)null : me.Id, id }, tx);

            var godchildName = CouponService.FullName(godchild.DataJson);
            var sponsorName = CouponService.FullName(sponsorJson);
            var label = await CouponService.CreateReferralCouponAsync(c, tx, settings, id, id, "GODCHILD", settings.ReferralGodchildPercent,
                $"Parrainage : filleul de {sponsorName}", null, me.Id, CouponService.Today(opt));
            await tx.CommitAsync();

            await audit.LogAsync(me, "referral.created", "client", id.ToString(), "Parrainage enregistré",
                $"**{godchildName}** est parrainé(e) par **{sponsorName}**.\n🏷️ Coupon filleul : **{label}**" +
                $"\nLe parrain recevra son coupon au premier achat du filleul." +
                (replacedCoupon is null ? "" : $"\nAncien coupon {replacedCoupon} annulé (parrain changé)."),
                $"/clients/{id}");
            return Results.Ok(new { ok = true, coupon = label });
        }).RequirePerm(Permissions.ReferralsManage);

        app.MapDelete("/api/clients/{id:guid}/sponsor", async (Guid id, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();
            var row = await c.QuerySingleOrDefaultAsync<(string DataJson, string? SponsorJson)>("""
                SELECT cl.data::text, sp.data::text FROM clients cl LEFT JOIN clients sp ON sp.id = cl.sponsor_id
                WHERE cl.id = @id AND cl.deleted_at IS NULL AND cl.sponsor_id IS NOT NULL
                FOR UPDATE OF cl
                """, new { id }, tx);
            if (row.DataJson is null) return EndpointAuth.NotFound("Ce client n'a pas de parrain.");
            if (await LockReasonAsync(c, tx, id) is { } locked) return EndpointAuth.Conflict(locked);

            var cancelled = await CancelGodchildCouponAsync(c, tx, id, me.Id, "Parrainage retiré");
            await c.ExecuteAsync("UPDATE clients SET sponsor_id = NULL, sponsor_set_at = NULL, sponsor_set_by = NULL WHERE id = @id", new { id }, tx);
            await tx.CommitAsync();

            await audit.LogAsync(me, "referral.deleted", "client", id.ToString(), "Parrainage retiré",
                $"**{CouponService.FullName(row.DataJson)}** n'est plus parrainé(e) par **{CouponService.FullName(row.SponsorJson ?? "{}")}**." +
                (cancelled is null ? "" : $"\nCoupon filleul {cancelled} annulé."),
                $"/clients/{id}");
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.ReferralsManage);
    }
}
