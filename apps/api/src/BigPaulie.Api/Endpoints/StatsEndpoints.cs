using System.Globalization;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Services;

namespace BigPaulie.Api.Endpoints;

/// <summary>Onglet Analyse : ventes non annulées sur une période (dates de Paris, bornes incluses).</summary>
public static class StatsEndpoints
{
    public static void MapStats(this WebApplication app)
    {
        app.MapGet("/api/stats", async (StatsService stats, string? from, string? to) =>
        {
            if (Range(stats, from, to) is not { } r) return EndpointAuth.Bad("Période limitée à un an.");
            return Results.Ok(await stats.ComputeAsync(r.Start, r.End));
        }).RequirePerm(Permissions.StatsView);

        // Récap au format Discord (même générateur que l'envoi automatique).
        app.MapGet("/api/stats/recap", async (StatsService stats, RecapService recap, string? from, string? to,
            bool? amounts, bool? compare, bool? vehicles, bool? sellers, bool? clients) =>
        {
            if (Range(stats, from, to) is not { } r) return EndpointAuth.Bad("Période limitée à un an.");
            var o = new RecapOptions(amounts ?? true, compare ?? true, vehicles ?? true, sellers ?? true, clients ?? true);
            var (cur, text) = await recap.BuildAsync(r.Start, r.End, o);
            return Results.Ok(new { from = cur.From, to = cur.To, text });
        }).RequirePerm(Permissions.StatsView);
    }

    private static (DateOnly Start, DateOnly End)? Range(StatsService stats, string? from, string? to)
    {
        var end = Parse(to) ?? stats.TodayLocal();
        var start = Parse(from) ?? end.AddDays(-6);
        if (start > end) (start, end) = (end, start);
        if (end.DayNumber - start.DayNumber > 366) return null;
        return (start, end);
    }

    private static DateOnly? Parse(string? s) =>
        DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d : null;
}
