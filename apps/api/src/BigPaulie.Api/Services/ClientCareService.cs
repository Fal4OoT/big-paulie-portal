using System.Globalization;
using System.Text.Json.Nodes;
using BigPaulie.Api.Domain;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

public sealed record GoalProgress(string Key, string Label, int Target, int Current);

public sealed record BirthdayInfo(Guid Id, string Name, string? Phone, string Date, int DaysUntil, int? Age, string? Coupon);

public sealed class InactiveClient
{
    public Guid Id { get; set; }
    public string DataJson { get; set; } = "{}";
    public int Purchases { get; set; }
    public decimal Total { get; set; }
    public DateTime LastPurchaseAt { get; set; }
}

/// <summary>Suivi client : objectifs de la semaine, anniversaires, clients à relancer.</summary>
public sealed class ClientCareService
{
    private readonly NpgsqlDataSource _db;
    private readonly StatsService _stats;

    public ClientCareService(NpgsqlDataSource db, StatsService stats)
    {
        _db = db;
        _stats = stats;
    }

    // ---------- Objectifs ----------

    public static bool HasGoals(PortalSettings s) => s.GoalSales > 0 || s.GoalDelivered > 0 || s.GoalNewClients > 0;

    /// <summary>Progression des objectifs sur une période (normalement lundi → dimanche).</summary>
    public async Task<List<GoalProgress>> GoalsAsync(PortalSettings s, DateOnly from, DateOnly to)
    {
        var list = new List<GoalProgress>();
        if (!HasGoals(s)) return list;
        var p = new { start = from.ToDateTime(TimeOnly.MinValue), endExcl = to.AddDays(1).ToDateTime(TimeOnly.MinValue), tz = _stats.TimeZone.Id };
        await using var c = await _db.OpenConnectionAsync();
        var n = await c.QuerySingleAsync<(int Sales, int Delivered, int NewClients)>("""
            SELECT
              (SELECT count(*)::int FROM sales s JOIN clients c ON c.id = s.client_id
                 WHERE c.deleted_at IS NULL AND s.status <> 'CANCELLED'
                   AND s.created_at >= (@start::timestamp AT TIME ZONE @tz) AND s.created_at < (@endExcl::timestamp AT TIME ZONE @tz)),
              (SELECT count(*)::int FROM sales s
                 WHERE s.status = 'DELIVERED'
                   AND s.delivered_at >= (@start::timestamp AT TIME ZONE @tz) AND s.delivered_at < (@endExcl::timestamp AT TIME ZONE @tz)),
              (SELECT count(*)::int FROM clients c
                 WHERE c.deleted_at IS NULL
                   AND c.created_at >= (@start::timestamp AT TIME ZONE @tz) AND c.created_at < (@endExcl::timestamp AT TIME ZONE @tz))
            """, p);
        if (s.GoalSales is int gs && gs > 0) list.Add(new("sales", "Ventes", gs, n.Sales));
        if (s.GoalDelivered is int gd && gd > 0) list.Add(new("delivered", "Livraisons", gd, n.Delivered));
        if (s.GoalNewClients is int gn && gn > 0) list.Add(new("newClients", "Nouveaux clients", gn, n.NewClients));
        return list;
    }

    // ---------- Anniversaires ----------

    /// <summary>Date d'anniversaire cette année (29 février → 28 février les années non bissextiles).</summary>
    public static DateOnly? BirthdayIn(int year, string? birth)
    {
        if (!DateOnly.TryParseExact(birth, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var b)) return null;
        var day = b.Month == 2 && b.Day == 29 && !DateTime.IsLeapYear(year) ? 28 : b.Day;
        return new DateOnly(year, b.Month, day);
    }

    /// <summary>Clients dont l'anniversaire tombe dans les <paramref name="days"/> prochains jours (aujourd'hui compris).</summary>
    public async Task<List<BirthdayInfo>> UpcomingBirthdaysAsync(int days)
    {
        var today = _stats.TodayLocal();
        await using var c = await _db.OpenConnectionAsync();
        var rows = await c.QueryAsync<(Guid Id, string DataJson)>("""
            SELECT id, data::text FROM clients
            WHERE deleted_at IS NULL AND data->>'date_naissance' ~ '^\d{4}-\d{2}-\d{2}$'
            """);
        var coupons = (await c.QueryAsync<(Guid ClientId, int Year, long Number, int Percent)>(
                "SELECT client_id, birthday_year, number, percent FROM coupons WHERE source = 'BIRTHDAY' AND birthday_year >= @y",
                new { y = today.Year }))
            .ToDictionary(x => (x.ClientId, x.Year), x => $"{CouponService.Ref(x.Number)} ({x.Percent} %)");

        var list = new List<BirthdayInfo>();
        foreach (var (id, json) in rows)
        {
            var data = FieldValidator.ParseObject(json);
            var birth = FieldValidator.GetString(data, "date_naissance");
            var next = BirthdayIn(today.Year, birth);
            if (next is null) continue;
            if (next < today) next = BirthdayIn(today.Year + 1, birth);
            var until = next!.Value.DayNumber - today.DayNumber;
            if (until < 0 || until >= days) continue;
            var born = DateOnly.ParseExact(birth!, "yyyy-MM-dd", CultureInfo.InvariantCulture);
            int? age = next.Value.Year - born.Year is var a and > 0 and < 130 ? a : null;
            coupons.TryGetValue((id, next.Value.Year), out var coupon);
            list.Add(new BirthdayInfo(id, FullName(data), FieldValidator.GetString(data, "telephone"),
                StatsService.Ymd(next.Value), until, age, coupon));
        }
        return list.OrderBy(b => b.DaysUntil).ThenBy(b => b.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>Crée les coupons d'anniversaire du jour (un par client et par année). Renvoie les clients concernés.</summary>
    public async Task<List<string>> GenerateBirthdayCouponsAsync(PortalSettings s)
    {
        var created = new List<string>();
        if (!s.BirthdayCouponEnabled) return created;
        var today = _stats.TodayLocal();
        var percent = Math.Clamp(s.BirthdayPercent, 1, s.CouponMaxPercent);
        var expires = s.BirthdayExpiryDays is > 0 ? today.AddDays(s.BirthdayExpiryDays.Value) : (DateOnly?)null;

        await using var c = await _db.OpenConnectionAsync();
        var rows = await c.QueryAsync<(Guid Id, string DataJson)>("""
            SELECT cl.id, cl.data::text FROM clients cl
            WHERE cl.deleted_at IS NULL AND cl.data->>'date_naissance' ~ '^\d{4}-\d{2}-\d{2}$'
              AND NOT EXISTS (SELECT 1 FROM coupons cp WHERE cp.client_id = cl.id AND cp.source = 'BIRTHDAY' AND cp.birthday_year = @year)
            """, new { year = today.Year });

        foreach (var (id, json) in rows)
        {
            var data = FieldValidator.ParseObject(json);
            if (BirthdayIn(today.Year, FieldValidator.GetString(data, "date_naissance")) != today) continue;

            await using var tx = await c.BeginTransactionAsync();
            var reason = $"Joyeux anniversaire {today.Year} 🎂";
            var cp = await c.QuerySingleOrDefaultAsync<(Guid Id, long Number)>("""
                INSERT INTO coupons (client_id, percent, reason, expires_on, source, birthday_year)
                VALUES (@id, @percent, @reason, @expires::date, 'BIRTHDAY', @year)
                ON CONFLICT DO NOTHING
                RETURNING id, number
                """, new { id, percent, reason, expires = expires?.ToDateTime(TimeOnly.MinValue), year = today.Year }, tx);
            if (cp.Id != Guid.Empty)
            {
                await CouponService.EventAsync(c, tx, cp.Id, "CREATED", null, reason, null);
                created.Add($"**{FullName(data)}** · {CouponService.Ref(cp.Number)} ({percent} %)");
            }
            await tx.CommitAsync();
        }
        return created;
    }

    // ---------- Clients à relancer ----------

    /// <summary>Clients ayant déjà acheté mais sans achat depuis <paramref name="weeks"/> semaines, les plus gros acheteurs d'abord.</summary>
    public async Task<List<object>> InactiveAsync(int weeks, int limit)
    {
        await using var c = await _db.OpenConnectionAsync();
        var rows = await c.QueryAsync<InactiveClient>("""
            SELECT cl.id, cl.data::text AS data_json, count(*)::int AS purchases, sum(s.price) AS total, max(s.created_at) AS last_purchase_at
            FROM clients cl JOIN sales s ON s.client_id = cl.id AND s.status <> 'CANCELLED'
            WHERE cl.deleted_at IS NULL
            GROUP BY cl.id
            HAVING max(s.created_at) < now() - make_interval(weeks => @weeks)
               AND NOT EXISTS (SELECT 1 FROM sales a WHERE a.client_id = cl.id AND a.status IN ('TO_ORDER','TO_FETCH','RECEIVED'))
            ORDER BY sum(s.price) DESC, count(*) DESC
            LIMIT @limit
            """, new { weeks, limit });
        return rows.Select(r =>
        {
            var data = FieldValidator.ParseObject(r.DataJson);
            return (object)new
            {
                r.Id,
                name = FullName(data),
                phone = FieldValidator.GetString(data, "telephone"),
                r.Purchases,
                r.Total,
                r.LastPurchaseAt,
            };
        }).ToList();
    }

    private static string FullName(JsonObject data) =>
        $"{FieldValidator.GetString(data, "prenom")} {FieldValidator.GetString(data, "nom")}".Trim() is { Length: > 0 } n ? n : "Client sans nom";
}

/// <summary>Génère les coupons d'anniversaire chaque jour (vérification toutes les 30 minutes).</summary>
public sealed class BirthdayCouponService : BackgroundService
{
    private readonly ConfigService _config;
    private readonly ClientCareService _care;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<BirthdayCouponService> _log;

    public BirthdayCouponService(ConfigService config, ClientCareService care, IServiceScopeFactory scopes, ILogger<BirthdayCouponService> log)
    {
        _config = config;
        _care = care;
        _scopes = scopes;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var created = await _care.GenerateBirthdayCouponsAsync(await _config.GetSettingsAsync());
                if (created.Count > 0)
                {
                    _log.LogInformation("{N} coupon(s) d'anniversaire créé(s).", created.Count);
                    using var scope = _scopes.CreateScope();
                    var audit = scope.ServiceProvider.GetRequiredService<AuditService>();
                    await audit.LogAsync(null, "coupon.birthday", "coupon", null, "🎂 Anniversaires du jour",
                        "Coupon d'anniversaire créé pour :\n" + string.Join("\n", created.Take(20).Select(x => "• " + x))
                        + (created.Count > 20 ? $"\n… et {created.Count - 20} autre(s)" : ""), "/");
                }
            }
            catch (Exception ex) { _log.LogWarning(ex, "Coupons d'anniversaire : erreur"); }

            try { await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
