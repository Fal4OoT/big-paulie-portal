using System.Globalization;
using System.Text;
using System.Text.Json;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

/// <summary>Sections du récap à afficher.</summary>
public sealed record RecapOptions(bool Amounts = true, bool Compare = true, bool Vehicles = true, bool Sellers = true, bool Clients = true, bool Goals = true)
{
    public static RecapOptions From(PortalSettings s) => new(s.RecapAmounts, s.RecapCompare, s.RecapVehicles, s.RecapSellers, s.RecapClients, s.RecapGoals);
}

/// <summary>Dernier envoi automatique (clé « weekly_recap » de la table settings).</summary>
public sealed class RecapState
{
    /// <summary>Lundi (AAAA-MM-JJ) de la semaine du dernier envoi automatique.</summary>
    public string? LastWeek { get; set; }
    public DateTime? SentAt { get; set; }
    public string? From { get; set; }
    public string? To { get; set; }
}

/// <summary>
/// Récap des ventes au format Discord. Un seul générateur pour la fenêtre « Récap Discord » d'Analyse
/// et pour l'envoi automatique hebdomadaire.
/// </summary>
public sealed class RecapService
{
    public const int DiscordLimit = 2000;
    private static readonly string[] Medals = { "🥇", "🥈", "🥉" };

    private readonly StatsService _stats;
    private readonly NpgsqlDataSource _db;
    private readonly ClientCareService _care;
    private readonly ConfigService _config;

    public RecapService(StatsService stats, NpgsqlDataSource db, ClientCareService care, ConfigService config)
    {
        _stats = stats;
        _db = db;
        _care = care;
        _config = config;
    }

    // ---------- Périodes ----------

    public static DateOnly Monday(DateOnly d) => d.AddDays(-(((int)d.DayOfWeek + 6) % 7));

    /// <summary>« previous » : semaine dernière complète (lundi → dimanche) ; « current » : lundi → aujourd'hui.</summary>
    public static (DateOnly From, DateOnly To) Week(string? kind, DateOnly today) =>
        kind == "current" ? (Monday(today), today) : (Monday(today).AddDays(-7), Monday(today).AddDays(-1));

    /// <summary>Heure d'envoi prévue pour la semaine contenant ce jour (heure locale).</summary>
    public static DateTime SlotLocal(PortalSettings s, DateOnly today) =>
        Monday(today).AddDays(Math.Clamp(s.RecapDay, 1, 7) - 1).ToDateTime(new TimeOnly(Math.Clamp(s.RecapHour, 0, 23), 0));

    // ---------- Génération ----------

    public async Task<(StatsResult Current, string Text)> BuildAsync(DateOnly from, DateOnly to, RecapOptions o)
    {
        var cur = await _stats.ComputeAsync(from, to);
        StatsResult? prev = null;
        if (o.Compare)
        {
            // Période précédente de même durée, juste avant.
            var n = to.DayNumber - from.DayNumber + 1;
            prev = await _stats.ComputeAsync(from.AddDays(-n), from.AddDays(-1));
        }
        // Objectifs : seulement pour une semaine commençant un lundi.
        List<GoalProgress>? goals = null;
        if (o.Goals && from == Monday(from) && to.DayNumber - from.DayNumber <= 6)
        {
            var settings = await _config.GetSettingsAsync();
            if (ClientCareService.HasGoals(settings)) goals = await _care.GoalsAsync(settings, from, to);
        }
        return (cur, Build(cur, prev, o, goals));
    }

    public static string Build(StatsResult cur, StatsResult? prev, RecapOptions o, List<GoalProgress>? goals = null)
    {
        var t = cur.Totals;
        string Cmp(decimal now, decimal before) => o.Compare && prev is not null ? Evolution(now, before) : "";
        var sb = new StringBuilder();
        void L(string line = "") => sb.Append(line).Append('\n');

        L("# 📊 Récap Big Paulie");
        L(cur.From == cur.To ? $"**{Date(cur.From)}**" : $"**Du {Date(cur.From)} au {Date(cur.To)}**");
        L();

        L("## 🚗 Ventes");
        L($"• **{Pl(t.Count, "véhicule vendu", "véhicules vendus")}**{Cmp(t.Count, prev?.Totals.Count ?? 0)}");
        if (o.Amounts)
        {
            L($"• **{Money(t.Revenue)}** de ventes{Cmp(t.Revenue, prev?.Totals.Revenue ?? 0)}");
            if (t.AveragePrice is { } avg) L($"• Prix moyen : **{Money(avg)}**");
        }
        L($"• **{Pl(t.Delivered, "livré", "livrés")}**"
          + (t.AvgDeliveryHours is { } h ? $" · délai moyen **{Duration(h)}**" : "")
          + (t.Pending > 0 ? $" · {t.Pending} encore en cours" : ""));
        if (t.Immediate + t.FromStock > 0) L($"• ⚡ {Pl(t.Immediate, "immédiat", "immédiats")} · 📦 {t.FromStock} depuis le stock");
        L();

        if (o.Vehicles && cur.Vehicles.Count > 0)
        {
            L("## 🏆 Top véhicules");
            var i = 0;
            foreach (var v in cur.Vehicles.Take(5))
                L($"{++i}. **{v.Label}** · {Pl(v.Count, "vente", "ventes")}" + (o.Amounts ? $" · {Money(v.Revenue)}" : ""));
            L();
        }

        if (o.Sellers && cur.Sellers.Count > 0)
        {
            L("## 👔 Vendeurs");
            var i = 0;
            foreach (var s in cur.Sellers.OrderByDescending(x => x.Count).ThenByDescending(x => x.Revenue).Take(5))
            {
                var rank = i < Medals.Length ? Medals[i] : $"{i + 1}.";
                i++;
                L($"{rank} **{s.Label}** · {Pl(s.Count, "vente", "ventes")}" + (o.Amounts ? $" · {Money(s.Revenue)}" : ""));
            }
            L();
        }

        if (o.Clients)
        {
            var k = cur.Clients;
            L("## 👥 Clients");
            L($"• **{Pl(k.NewClients, "nouveau client enregistré", "nouveaux clients enregistrés")}**{Cmp(k.NewClients, prev?.Clients.NewClients ?? 0)}");
            L($"• **{Pl(k.Buyers, "client acheteur", "clients acheteurs")}** : {k.FirstTimeBuyers} premier achat · {k.ReturningBuyers} déjà clients");
            if (k.RepeatBuyers > 0) L(k.RepeatBuyers > 1 ? $"• {k.RepeatBuyers} clients ont acheté plusieurs fois 🔁" : "• 1 client a acheté plusieurs fois 🔁");
            L();
        }

        if (goals is { Count: > 0 })
        {
            L("## 🎯 Objectifs de la semaine");
            foreach (var g in goals)
            {
                var pct = (int)Math.Round(100.0 * g.Current / g.Target);
                L($"{(g.Current >= g.Target ? "✅" : "▫️")} {g.Label} : **{g.Current} / {g.Target}** ({pct} %)");
            }
            L();
        }

        sb.Append(t.Count > 0 ? "Merci à toute l'équipe, on continue comme ça ! 💪" : "On se rattrape la semaine prochaine ! 💪");
        return sb.ToString();
    }

    /// <summary>Découpe en messages de 2000 caractères maximum, entre deux sections si possible.</summary>
    public static List<string> Split(string text, int max = DiscordLimit)
    {
        var parts = new List<string>();
        var cur = new StringBuilder();
        foreach (var block in text.Split("\n\n"))
        {
            var piece = block.Length <= max ? block : block[..(max - 1)] + "…";
            if (cur.Length > 0 && cur.Length + 2 + piece.Length > max)
            {
                parts.Add(cur.ToString());
                cur.Clear();
            }
            if (cur.Length > 0) cur.Append("\n\n");
            cur.Append(piece);
        }
        if (cur.Length > 0) parts.Add(cur.ToString());
        return parts;
    }

    /// <summary>Publie le récap (en plusieurs messages si besoin). Renvoie false si Discord a refusé.</summary>
    public static async Task<bool> SendAsync(DiscordRestClient discord, string channelId, string? pingRoleId, string text, CancellationToken ct)
    {
        var parts = Split(text, DiscordLimit - 30);
        for (var i = 0; i < parts.Count; i++)
        {
            var ping = i == 0 && !string.IsNullOrWhiteSpace(pingRoleId);
            var payload = new
            {
                Content = (ping ? $"<@&{pingRoleId}>\n" : "") + parts[i],
                AllowedMentions = new { Parse = Array.Empty<string>(), Roles = ping ? new[] { pingRoleId! } : Array.Empty<string>() },
            };
            if (await discord.CreateMessageAsync(channelId, payload, ct) is null) return false;
        }
        return true;
    }

    // ---------- État de l'envoi automatique ----------

    public async Task<RecapState> GetStateAsync()
    {
        await using var c = await _db.OpenConnectionAsync();
        var json = await c.ExecuteScalarAsync<string?>("SELECT value::text FROM settings WHERE key = 'weekly_recap'");
        return json is null ? new RecapState() : JsonSerializer.Deserialize<RecapState>(json, ConfigService.Json) ?? new RecapState();
    }

    public async Task SaveStateAsync(RecapState state)
    {
        await using var c = await _db.OpenConnectionAsync();
        await c.ExecuteAsync(
            "INSERT INTO settings (key, value) VALUES ('weekly_recap', @v::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            new { v = JsonSerializer.Serialize(state, ConfigService.Json) });
    }

    /// <summary>Prochain envoi prévu (UTC), ou null si l'envoi automatique est désactivé.</summary>
    public DateTime? NextRunUtc(PortalSettings s, RecapState state)
    {
        if (!s.RecapEnabled || string.IsNullOrWhiteSpace(s.RecapChannelId)) return null;
        var tz = _stats.TimeZone;
        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
        var today = DateOnly.FromDateTime(nowLocal);
        var slot = SlotLocal(s, today);
        var sentThisWeek = state.LastWeek == StatsService.Ymd(Monday(today));
        if (sentThisWeek || nowLocal >= slot.AddHours(WeeklyRecapService.CatchUpHours)) slot = slot.AddDays(7);
        else if (nowLocal > slot) slot = nowLocal; // rattrapage imminent
        return ToUtc(slot, tz);
    }

    internal static DateTime ToUtc(DateTime local, TimeZoneInfo tz)
    {
        var unspecified = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        // Heure inexistante (passage à l'heure d'été) : on décale d'une heure.
        if (tz.IsInvalidTime(unspecified)) unspecified = unspecified.AddHours(1);
        return TimeZoneInfo.ConvertTimeToUtc(unspecified, tz);
    }

    // ---------- Mise en forme ----------

    private static string Pl(int n, string one, string many) => $"{n} {(n > 1 ? many : one)}";

    private static string Date(string ymd)
    {
        var p = ymd.Split('-');
        return p.Length == 3 ? $"{p[2]}/{p[1]}/{p[0]}" : ymd;
    }

    private static string Evolution(decimal now, decimal before)
    {
        if (before == 0) return now > 0 ? " (nouveau)" : "";
        var pct = (int)Math.Round((now - before) / before * 100, MidpointRounding.AwayFromZero);
        return pct switch
        {
            0 => " (=)",
            > 0 => $" (▲ +{pct} %)",
            _ => $" (▼ {-pct} %)",
        };
    }

    private static string Duration(double hours)
    {
        if (hours < 1) return $"{Math.Max(1, (int)Math.Round(hours * 60))} min";
        if (hours < 48) return hours.ToString("0.0", CultureInfo.InvariantCulture).Replace('.', ',') + " h";
        return (hours / 24).ToString("0.0", CultureInfo.InvariantCulture).Replace('.', ',') + " j";
    }

    /// <summary>Montant compact : 1 250 000 → « 1,25 M$ », 45 000 → « 45 k$ », 9 500 → « 9 500 $ ».</summary>
    public static string Money(decimal v)
    {
        if (v >= 1_000_000) return (Math.Round(v / 1_000_000m, 2)).ToString("0.##", CultureInfo.InvariantCulture).Replace('.', ',') + " M$";
        if (v >= 10_000) return Group((long)Math.Round(v / 1000m, MidpointRounding.AwayFromZero)) + " k$";
        return Group((long)Math.Round(v, MidpointRounding.AwayFromZero)) + " $";
    }

    private static string Group(long n)
    {
        var digits = Math.Abs(n).ToString(CultureInfo.InvariantCulture);
        var sb = new StringBuilder();
        for (var i = 0; i < digits.Length; i++)
        {
            if (i > 0 && (digits.Length - i) % 3 == 0) sb.Append(' ');
            sb.Append(digits[i]);
        }
        return (n < 0 ? "-" : "") + sb;
    }
}

/// <summary>Envoi automatique du récap une fois par semaine, au jour et à l'heure configurés (heure de Paris).</summary>
public sealed class WeeklyRecapService : BackgroundService
{
    /// <summary>Si le serveur était arrêté à l'heure prévue, le récap part encore dans les heures qui suivent.</summary>
    public const int CatchUpHours = 24;
    private const int MaxFailures = 5;

    private readonly ConfigService _config;
    private readonly RecapService _recap;
    private readonly StatsService _stats;
    private readonly DiscordRestClient _discord;
    private readonly ILogger<WeeklyRecapService> _log;
    private (string Week, int Count) _failures = ("", 0);

    public WeeklyRecapService(ConfigService config, RecapService recap, StatsService stats, DiscordRestClient discord, ILogger<WeeklyRecapService> log)
    {
        _config = config;
        _recap = recap;
        _stats = stats;
        _discord = discord;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Laisse le temps aux migrations et au reste du démarrage.
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await TickAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { _log.LogWarning(ex, "Récap hebdomadaire : erreur"); }

            // Vérification chaque minute, quelques secondes après le changement de minute.
            var now = DateTime.UtcNow;
            var wait = TimeSpan.FromSeconds(65 - now.Second);
            try { await Task.Delay(wait, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        var s = await _config.GetSettingsAsync();
        if (!s.RecapEnabled || string.IsNullOrWhiteSpace(s.RecapChannelId)) return;

        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, _stats.TimeZone);
        var today = DateOnly.FromDateTime(nowLocal);
        var slot = RecapService.SlotLocal(s, today);
        if (nowLocal < slot || nowLocal >= slot.AddHours(CatchUpHours)) return;

        var week = StatsService.Ymd(RecapService.Monday(today));
        var state = await _recap.GetStateAsync();
        if (state.LastWeek == week) return;
        if (_failures.Week == week && _failures.Count >= MaxFailures) return;

        var (from, to) = RecapService.Week(s.RecapWeek, today);
        var (_, text) = await _recap.BuildAsync(from, to, RecapOptions.From(s));
        if (await RecapService.SendAsync(_discord, s.RecapChannelId!, s.RecapPingRoleId, text, ct))
        {
            await _recap.SaveStateAsync(new RecapState { LastWeek = week, SentAt = DateTime.UtcNow, From = StatsService.Ymd(from), To = StatsService.Ymd(to) });
            _failures = ("", 0);
            _log.LogInformation("Récap hebdomadaire envoyé ({From} → {To}).", from, to);
        }
        else
        {
            _failures = (week, _failures.Week == week ? _failures.Count + 1 : 1);
            _log.LogWarning("Récap hebdomadaire refusé par Discord (tentative {N}/{Max}) : vérifie le salon et les droits du bot.", _failures.Count, MaxFailures);
        }
    }
}
