using BigPaulie.Api.Domain;
using BigPaulie.Api.Infrastructure;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

/// <summary>
/// Règles des coupons de promotion. Toutes les méthodes travaillent dans la transaction de l'appelant,
/// pour que la vente et le coupon changent ensemble (ou pas du tout).
/// </summary>
public static class CouponService
{
    public static string Ref(long number) => $"CP-{number:0000}";

    /// <summary>Date du jour à Paris : un coupon est valable jusqu'à sa date d'expiration incluse.</summary>
    public static DateOnly Today(PortalOptions opt) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TourService.ResolveTimeZone(opt.TimeZone)));

    /// <summary>Condition SQL d'un coupon utilisable (alias « cp »).</summary>
    public const string AvailableSql = "cp.cancelled_at IS NULL AND cp.used_sale_id IS NULL AND (cp.expires_on IS NULL OR cp.expires_on >= @today)";

    private sealed class CouponLite
    {
        public Guid Id { get; set; }
        public long Number { get; set; }
        public int Percent { get; set; }
        public string Reason { get; set; } = "";
        public Guid ClientId { get; set; }
        public Guid? UsedSaleId { get; set; }
        public DateTime? CancelledAt { get; set; }
        public DateTime? ExpiresOn { get; set; }
    }

    private sealed class CouponRef
    {
        public Guid Id { get; set; }
        public long Number { get; set; }
    }

    private static Task<CouponLite?> GetAsync(NpgsqlConnection c, NpgsqlTransaction tx, Guid id) =>
        c.QuerySingleOrDefaultAsync<CouponLite>(
            "SELECT id, number, percent, reason, client_id, used_sale_id, cancelled_at, expires_on FROM coupons WHERE id = @id FOR UPDATE",
            new { id }, tx);

    public static Task EventAsync(NpgsqlConnection c, NpgsqlTransaction? tx, Guid couponId, string action, Guid? saleId, string? note, Guid? actorId) =>
        c.ExecuteAsync("INSERT INTO coupon_events (coupon_id, action, sale_id, note, actor_id) VALUES (@couponId, @action, @saleId, @note, @actorId)",
            new { couponId, action, saleId, note, actorId = actorId == Guid.Empty ? null : actorId }, tx);

    /// <summary>Utilise un coupon sur une vente. Renvoie un message d'erreur, ou null si c'est fait.</summary>
    public static async Task<(string? Error, string? Label)> ApplyAsync(NpgsqlConnection c, NpgsqlTransaction tx,
        Guid couponId, Guid saleId, Guid clientId, Guid actorId, DateOnly today)
    {
        var cp = await GetAsync(c, tx, couponId);
        if (cp is null || cp.ClientId != clientId) return ("Ce coupon n'appartient pas à ce client.", null);
        if (cp.CancelledAt is not null) return ("Ce coupon a été annulé.", null);
        if (cp.UsedSaleId is not null) return ("Ce coupon a déjà été utilisé.", null);
        if (cp.ExpiresOn is { } exp && DateOnly.FromDateTime(exp) < today) return ("Ce coupon a expiré.", null);

        await c.ExecuteAsync("UPDATE coupons SET used_sale_id = @saleId, used_by = @actor, used_at = now() WHERE id = @couponId",
            new { saleId, actor = actorId == Guid.Empty ? (Guid?)null : actorId, couponId }, tx);
        await c.ExecuteAsync("UPDATE sales SET coupon_id = @couponId WHERE id = @saleId", new { couponId, saleId }, tx);
        await EventAsync(c, tx, couponId, "USED", saleId, null, actorId);
        return (null, $"{Ref(cp.Number)} ({cp.Percent} %)");
    }

    /// <summary>Retire le coupon d'une vente et le rend de nouveau disponible. Renvoie son libellé, ou null s'il n'y en avait pas.</summary>
    public static async Task<string?> ReleaseAsync(NpgsqlConnection c, NpgsqlTransaction tx, Guid saleId, Guid actorId, string note)
    {
        var couponId = await c.ExecuteScalarAsync<Guid?>("SELECT coupon_id FROM sales WHERE id = @saleId", new { saleId }, tx);
        if (couponId is null) return null;
        var cp = await GetAsync(c, tx, couponId.Value);
        await c.ExecuteAsync("UPDATE sales SET coupon_id = NULL WHERE id = @saleId", new { saleId }, tx);
        await c.ExecuteAsync("UPDATE coupons SET used_sale_id = NULL, used_by = NULL, used_at = NULL WHERE id = @id AND used_sale_id = @saleId",
            new { id = couponId, saleId }, tx);
        await EventAsync(c, tx, couponId.Value, "RELEASED", saleId, note, actorId);
        return cp is null ? null : $"{Ref(cp.Number)} ({cp.Percent} %)";
    }

    /// <summary>
    /// Fidélité, à la création d'une vente : tous les N achats (ventes non annulées, achats passés compris),
    /// un coupon est généré. Renvoie son libellé, ou null.
    /// </summary>
    public static async Task<string?> LoyaltyOnSaleCreatedAsync(NpgsqlConnection c, NpgsqlTransaction tx, PortalSettings s,
        Guid clientId, Guid saleId, Guid actorId, DateOnly today)
    {
        if (!s.LoyaltyEnabled || s.LoyaltyEvery < 1 || s.LoyaltyPercent < 1) return null;
        var count = await c.ExecuteScalarAsync<int>(
            "SELECT count(*)::int FROM sales WHERE client_id = @clientId AND status <> 'CANCELLED'", new { clientId }, tx);
        if (count % s.LoyaltyEvery != 0) return null;

        var percent = Math.Min(s.LoyaltyPercent, s.CouponMaxPercent);
        var expires = s.LoyaltyExpiryDays is > 0 ? today.AddDays(s.LoyaltyExpiryDays.Value) : (DateOnly?)null;
        var created = await c.QuerySingleAsync<(Guid Id, long Number)>("""
            INSERT INTO coupons (client_id, percent, reason, expires_on, source, source_sale_id, created_by)
            VALUES (@clientId, @percent, @reason, @expires::date, 'LOYALTY', @saleId, @actor)
            RETURNING id, number
            """, new
        {
            clientId,
            percent,
            reason = $"Fidélité : {count}e achat",
            expires = expires?.ToDateTime(TimeOnly.MinValue),
            saleId,
            actor = actorId == Guid.Empty ? (Guid?)null : actorId,
        }, tx);
        await EventAsync(c, tx, created.Id, "CREATED", saleId, $"Fidélité : {count}e achat", actorId);
        return $"{Ref(created.Number)} ({percent} %)";
    }

    /// <summary>
    /// Vente annulée : les coupons qu'elle avait générés (fidélité, parrainage côté parrain) sont annulés
    /// s'ils n'ont pas encore servi. Renvoie leurs références.
    /// </summary>
    public static async Task<List<string>> GeneratedOnSaleCancelledAsync(NpgsqlConnection c, NpgsqlTransaction tx, Guid saleId, Guid actorId)
    {
        var rows = (await c.QueryAsync<CouponRef>("""
            UPDATE coupons SET cancelled_at = now(), cancelled_by = @actor, cancel_reason = 'Vente annulée', cancelled_with_sale = true
            WHERE source IN ('LOYALTY', 'REFERRAL') AND source_sale_id = @saleId AND used_sale_id IS NULL AND cancelled_at IS NULL
            RETURNING id, number
            """, new { saleId, actor = actorId == Guid.Empty ? (Guid?)null : actorId }, tx)).ToList();
        foreach (var cp in rows) await EventAsync(c, tx, cp.Id, "CANCELLED", saleId, "Vente annulée", actorId);
        return rows.Select(r => Ref(r.Number)).ToList();
    }

    /// <summary>
    /// Vente rétablie : les coupons annulés avec elle redeviennent disponibles. Un coupon de parrain n'est rétabli
    /// que si aucun autre n'a été généré entre-temps pour le même filleul (un seul par filleul).
    /// </summary>
    public static async Task<List<string>> GeneratedOnSaleRestoredAsync(NpgsqlConnection c, NpgsqlTransaction tx, Guid saleId, Guid actorId)
    {
        var rows = (await c.QueryAsync<CouponRef>("""
            UPDATE coupons cp SET cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL, cancelled_with_sale = false
            WHERE cp.source_sale_id = @saleId AND cp.cancelled_with_sale
              AND (cp.source = 'LOYALTY'
                   OR NOT EXISTS (SELECT 1 FROM coupons o WHERE o.id <> cp.id AND o.source = 'REFERRAL' AND o.referral_role = 'SPONSOR'
                                  AND o.referral_godchild_id = cp.referral_godchild_id AND o.cancelled_at IS NULL))
            RETURNING id, number
            """, new { saleId }, tx)).ToList();
        foreach (var cp in rows) await EventAsync(c, tx, cp.Id, "RESTORED", saleId, "Vente rétablie", actorId);
        return rows.Select(r => Ref(r.Number)).ToList();
    }

    // ---------- Parrainage ----------

    /// <summary>Crée un coupon de parrainage. Renvoie sa référence.</summary>
    public static async Task<string> CreateReferralCouponAsync(NpgsqlConnection c, NpgsqlTransaction tx, PortalSettings s,
        Guid ownerId, Guid godchildId, string role, int percent, string reason, Guid? saleId, Guid actorId, DateOnly today)
    {
        percent = Math.Clamp(percent, 1, s.CouponMaxPercent);
        var expires = s.ReferralExpiryDays is > 0 ? today.AddDays(s.ReferralExpiryDays.Value) : (DateOnly?)null;
        var created = await c.QuerySingleAsync<CouponRef>("""
            INSERT INTO coupons (client_id, percent, reason, expires_on, source, source_sale_id, referral_godchild_id, referral_role, created_by)
            VALUES (@ownerId, @percent, @reason, @expires::date, 'REFERRAL', @saleId, @godchildId, @role, @actor)
            RETURNING id, number
            """, new
        {
            ownerId,
            percent,
            reason,
            expires = expires?.ToDateTime(TimeOnly.MinValue),
            saleId,
            godchildId,
            role,
            actor = actorId == Guid.Empty ? (Guid?)null : actorId,
        }, tx);
        await EventAsync(c, tx, created.Id, "CREATED", saleId, reason, actorId);
        return $"{Ref(created.Number)} ({percent} %)";
    }

    /// <summary>
    /// Premier achat d'un filleul : son parrain reçoit son coupon (une seule fois par filleul).
    /// Renvoie la référence du coupon et l'id du parrain, ou null.
    /// </summary>
    public static async Task<SponsorReward?> ReferralOnSaleCreatedAsync(NpgsqlConnection c, NpgsqlTransaction tx,
        PortalSettings s, Guid clientId, Guid saleId, Guid actorId, DateOnly today)
    {
        if (!s.ReferralEnabled) return null;
        var sponsor = await c.QuerySingleOrDefaultAsync<SponsorRow>("""
            SELECT sp.id, sp.data::text AS data_json, cl.data::text AS godchild_json
            FROM clients cl JOIN clients sp ON sp.id = cl.sponsor_id AND sp.deleted_at IS NULL
            WHERE cl.id = @clientId
            """, new { clientId }, tx);
        if (sponsor is null) return null;

        var already = await c.ExecuteScalarAsync<bool>("""
            SELECT EXISTS (SELECT 1 FROM coupons WHERE source = 'REFERRAL' AND referral_role = 'SPONSOR'
                           AND referral_godchild_id = @clientId AND cancelled_at IS NULL)
            """, new { clientId }, tx);
        if (already) return null;

        var godchildName = FullName(sponsor.GodchildJson);
        var label = await CreateReferralCouponAsync(c, tx, s, sponsor.Id, clientId, "SPONSOR", s.ReferralSponsorPercent,
            $"Parrainage : premier achat de {godchildName}", saleId, actorId, today);
        return new SponsorReward(label, sponsor.Id, FullName(sponsor.DataJson), godchildName);
    }

    public sealed record SponsorReward(string Label, Guid SponsorId, string SponsorName, string GodchildName);

    private sealed class SponsorRow
    {
        public Guid Id { get; set; }
        public string DataJson { get; set; } = "{}";
        public string GodchildJson { get; set; } = "{}";
    }

    public static string FullName(string json) => Endpoints.ClientEndpoints.FullName(FieldValidator.ParseObject(json));
}
