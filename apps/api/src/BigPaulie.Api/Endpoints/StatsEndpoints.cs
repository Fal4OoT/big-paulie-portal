using System.Globalization;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Infrastructure;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

/// <summary>Onglet Analyse : ventes non annulées sur une période (dates de Paris, bornes incluses).</summary>
public static class StatsEndpoints
{
    private sealed class GroupRow
    {
        public string Label { get; set; } = "";
        public string? Detail { get; set; }
        public int Count { get; set; }
        public decimal Revenue { get; set; }
    }

    private sealed class ClientTotals
    {
        public int NewClients { get; set; }
        public int Buyers { get; set; }
        public int FirstTimeBuyers { get; set; }
        public int ReturningBuyers { get; set; }
        public int RepeatBuyers { get; set; }
        public int NewClientsConverted { get; set; }
        public int TotalClients { get; set; }
    }

    private sealed class Totals
    {
        public int Count { get; set; }
        public decimal Revenue { get; set; }
        public decimal? AveragePrice { get; set; }
        public int Delivered { get; set; }
        public int Pending { get; set; }
        public int Immediate { get; set; }
        public int FromStock { get; set; }
        public int OffCatalog { get; set; }
        public int Cancelled { get; set; }
        public double? AvgDeliveryHours { get; set; }
    }

    public static void MapStats(this WebApplication app)
    {
        app.MapGet("/api/stats", async (NpgsqlDataSource db, PortalOptions opt, string? from, string? to) =>
        {
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Services.TourService.ResolveTimeZone(opt.TimeZone)));
            var end = Parse(to) ?? today;
            var start = Parse(from) ?? end.AddDays(-6);
            if (start > end) (start, end) = (end, start);
            if (end.DayNumber - start.DayNumber > 366) return EndpointAuth.Bad("Période limitée à un an.");

            var p = new { start = start.ToDateTime(TimeOnly.MinValue), endExcl = end.AddDays(1).ToDateTime(TimeOnly.MinValue), tz = opt.TimeZone };
            // Période en heure de Paris, convertie en instants UTC pour l'index sur created_at.
            const string Period = "s.created_at >= (@start::timestamp AT TIME ZONE @tz) AND s.created_at < (@endExcl::timestamp AT TIME ZONE @tz)";
            const string Valid = Period + " AND s.status <> 'CANCELLED'";
            const string ClientPeriod = "c.created_at >= (@start::timestamp AT TIME ZONE @tz) AND c.created_at < (@endExcl::timestamp AT TIME ZONE @tz)";

            await using var c = await db.OpenConnectionAsync();

            var totals = await c.QuerySingleAsync<Totals>($"""
                SELECT count(*) FILTER (WHERE s.status <> 'CANCELLED')::int AS count,
                       coalesce(sum(s.price) FILTER (WHERE s.status <> 'CANCELLED'), 0) AS revenue,
                       avg(s.price) FILTER (WHERE s.status <> 'CANCELLED') AS average_price,
                       count(*) FILTER (WHERE s.status = 'DELIVERED')::int AS delivered,
                       count(*) FILTER (WHERE s.status IN ('TO_ORDER','TO_FETCH','RECEIVED'))::int AS pending,
                       count(*) FILTER (WHERE s.immediate AND s.status <> 'CANCELLED')::int AS immediate,
                       count(*) FILTER (WHERE s.from_stock AND s.status <> 'CANCELLED')::int AS from_stock,
                       count(*) FILTER (WHERE s.catalog_vehicle_id IS NULL AND s.status <> 'CANCELLED')::int AS off_catalog,
                       count(*) FILTER (WHERE s.status = 'CANCELLED')::int AS cancelled,
                       (avg(extract(epoch FROM (s.delivered_at - s.created_at)) / 3600) FILTER (WHERE s.status = 'DELIVERED'))::float8 AS avg_delivery_hours
                FROM sales s WHERE {Period}
                """, p);

            // Véhicules : regroupés par véhicule du catalogue (nom uniforme), sinon par nom libre.
            var vehicles = await c.QueryAsync<GroupRow>($"""
                SELECT coalesce(cv.name, s.vehicle_name) AS label,
                       CASE WHEN cv.id IS NULL THEN 'Hors catalogue' ELSE coalesce(cs.label, vt.label) END AS detail,
                       count(*)::int AS count, sum(s.price) AS revenue
                FROM sales s
                JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
                LEFT JOIN catalog_vehicles cv ON cv.id = s.catalog_vehicle_id
                LEFT JOIN catalog_segments cs ON cs.emoji = cv.segment_emoji
                WHERE {Valid}
                GROUP BY cv.id, coalesce(cv.name, s.vehicle_name), CASE WHEN cv.id IS NULL THEN 'Hors catalogue' ELSE coalesce(cs.label, vt.label) END
                ORDER BY count(*) DESC, sum(s.price) DESC, 1
                LIMIT 50
                """, p);

            var segments = await c.QueryAsync<GroupRow>($"""
                SELECT CASE WHEN cv.id IS NULL THEN 'Hors catalogue' ELSE coalesce(cs.label, 'Sans gamme') END AS label,
                       cs.emoji AS detail, count(*)::int AS count, sum(s.price) AS revenue
                FROM sales s
                LEFT JOIN catalog_vehicles cv ON cv.id = s.catalog_vehicle_id
                LEFT JOIN catalog_segments cs ON cs.emoji = cv.segment_emoji
                WHERE {Valid}
                GROUP BY 1, 2 ORDER BY count(*) DESC, 1
                """, p);

            var types = await c.QueryAsync<GroupRow>($"""
                SELECT vt.label AS label, vc.label AS detail, count(*)::int AS count, sum(s.price) AS revenue
                FROM sales s
                JOIN vehicle_types vt ON vt.id = s.vehicle_type_id
                JOIN vehicle_categories vc ON vc.id = vt.category_id
                WHERE {Valid}
                GROUP BY vt.label, vc.label ORDER BY count(*) DESC, 1
                """, p);

            var sellers = await c.QueryAsync<GroupRow>($"""
                SELECT u.display_name AS label, NULL AS detail, count(*)::int AS count, sum(s.price) AS revenue
                FROM sales s JOIN users u ON u.id = s.seller_id
                WHERE {Valid}
                GROUP BY u.id, u.display_name ORDER BY count(*) DESC, sum(s.price) DESC
                """, p);

            var daily = (await c.QueryAsync<(DateTime Day, int Count, decimal Revenue)>($"""
                SELECT (s.created_at AT TIME ZONE @tz)::date AS day, count(*)::int, sum(s.price)
                FROM sales s WHERE {Valid}
                GROUP BY 1 ORDER BY 1
                """, p)).ToDictionary(d => DateOnly.FromDateTime(d.Day));

            // Clients enregistrés par jour (même période, heure de Paris).
            var newClientsDaily = (await c.QueryAsync<(DateTime Day, int Count)>($"""
                SELECT (c.created_at AT TIME ZONE @tz)::date AS day, count(*)::int
                FROM clients c WHERE c.deleted_at IS NULL AND {ClientPeriod}
                GROUP BY 1 ORDER BY 1
                """, p)).ToDictionary(d => DateOnly.FromDateTime(d.Day), d => d.Count);

            // Tous les jours de la période, même sans vente (pour le graphique).
            var days = new List<object>();
            for (var d = start; d <= end; d = d.AddDays(1))
            {
                daily.TryGetValue(d, out var row);
                newClientsDaily.TryGetValue(d, out var newClients);
                days.Add(new { date = d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), count = row.Count, revenue = row.Revenue, newClients });
            }

            // Clients : nouveaux, acheteurs (premier achat / déjà clients), achats répétés, transformation.
            var clients = await c.QuerySingleAsync<ClientTotals>($"""
                WITH period_sales AS (SELECT s.client_id, s.price FROM sales s WHERE {Valid}),
                     first_sale AS (SELECT s.client_id, min(s.created_at) AS first_at FROM sales s WHERE s.status <> 'CANCELLED' GROUP BY s.client_id),
                     per_client AS (SELECT client_id, count(*) AS n FROM period_sales GROUP BY client_id)
                SELECT
                    (SELECT count(*)::int FROM clients c WHERE c.deleted_at IS NULL AND {ClientPeriod}) AS new_clients,
                    (SELECT count(*)::int FROM per_client) AS buyers,
                    (SELECT count(*)::int FROM per_client pc JOIN first_sale f ON f.client_id = pc.client_id
                       WHERE f.first_at >= (@start::timestamp AT TIME ZONE @tz)) AS first_time_buyers,
                    (SELECT count(*)::int FROM per_client pc JOIN first_sale f ON f.client_id = pc.client_id
                       WHERE f.first_at < (@start::timestamp AT TIME ZONE @tz)) AS returning_buyers,
                    (SELECT count(*)::int FROM per_client WHERE n > 1) AS repeat_buyers,
                    (SELECT count(*)::int FROM clients c WHERE c.deleted_at IS NULL AND {ClientPeriod}
                       AND EXISTS (SELECT 1 FROM per_client pc WHERE pc.client_id = c.id)) AS new_clients_converted,
                    (SELECT count(*)::int FROM clients WHERE deleted_at IS NULL) AS total_clients
                """, p);

            var topClients = await c.QueryAsync<GroupRow>($"""
                SELECT trim(coalesce(c.data->>'prenom','') || ' ' || coalesce(c.data->>'nom','')) AS label,
                       c.id::text AS detail, count(*)::int AS count, sum(s.price) AS revenue
                FROM sales s JOIN clients c ON c.id = s.client_id
                WHERE {Valid}
                GROUP BY c.id ORDER BY sum(s.price) DESC, count(*) DESC
                LIMIT 50
                """, p);

            return Results.Ok(new
            {
                from = start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                to = end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                totals,
                vehicles,
                segments,
                types,
                sellers,
                days,
                clients,
                topClients,
            });
        }).RequirePerm(Permissions.StatsView);
    }

    private static DateOnly? Parse(string? s) =>
        DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
}
