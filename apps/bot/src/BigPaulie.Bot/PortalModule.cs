using Discord;
using Discord.Interactions;

namespace BigPaulie.Bot;

/// <summary>Commandes slash. Réponses éphémères : seul l'auteur les voit.</summary>
public sealed class PortalModule : InteractionModuleBase<SocketInteractionContext>
{
    private static readonly Color Red = new(0x9E1B1E);
    private static readonly Color Green = new(0x1F5A3A);

    private readonly PortalApi _api;
    private readonly BotOptions _opt;

    public PortalModule(PortalApi api, BotOptions opt)
    {
        _api = api;
        _opt = opt;
    }

    [SlashCommand("client", "Rechercher un client du Big Paulie")]
    public async Task ClientAsync([Summary("recherche", "Nom, prénom ou téléphone")] string recherche)
    {
        await DeferAsync(ephemeral: true);
        var res = await _api.SearchClientsAsync(Context.User.Id, recherche);
        if (res.Data is null) { await ErrorAsync(res.Error); return; }

        var embed = new EmbedBuilder().WithColor(Red).WithTitle($"🔎 Clients · « {Short(recherche, 60)} »");
        if (res.Data.Count == 0) embed.WithDescription("Aucun client trouvé.");
        foreach (var c in res.Data)
        {
            var lines = new List<string>();
            if (!string.IsNullOrEmpty(c.Telephone)) lines.Add($"📞 {c.Telephone}");
            if (!string.IsNullOrEmpty(c.DateNaissance) && DateOnly.TryParse(c.DateNaissance, out var d)) lines.Add($"🎂 {d:dd/MM/yyyy}");
            if (c.ActiveSaleCount > 0) lines.Add($"🚗 {c.ActiveSaleCount} vente(s) en cours");
            lines.Add($"[Ouvrir la fiche]({_opt.PublicUrl}/clients/{c.Id})");
            embed.AddField(Short(c.Name, 250), string.Join("\n", lines));
        }
        await FollowupAsync(embed: embed.Build(), ephemeral: true);
    }

    [SlashCommand("vente", "Rechercher une vente (référence BP-0001, plaque, véhicule ou client)")]
    public async Task VenteAsync([Summary("recherche", "Référence, plaque, véhicule ou nom du client")] string recherche)
    {
        await DeferAsync(ephemeral: true);
        var res = await _api.SearchSalesAsync(Context.User.Id, recherche);
        if (res.Data is null) { await ErrorAsync(res.Error); return; }

        var embed = new EmbedBuilder().WithColor(Red).WithTitle($"🔎 Ventes · « {Short(recherche, 60)} »");
        if (res.Data.Count == 0) embed.WithDescription("Aucune vente trouvée.");
        foreach (var s in res.Data)
        {
            var lines = new List<string>
            {
                $"👤 {s.ClientName}",
                $"📌 **{s.StatusLabel}**{(s.Immediate ? " · ⚡ immédiat" : "")}",
            };
            if (!string.IsNullOrEmpty(s.Plate)) lines.Add($"🔖 Plaque {s.Plate}");
            if (s.PermitWarning) lines.Add("⚠️ Permis non renseigné");
            lines.Add($"🧾 Vendu par {s.SellerName} · <t:{new DateTimeOffset(DateTime.SpecifyKind(s.CreatedAt, DateTimeKind.Utc)).ToUnixTimeSeconds()}:d>");
            lines.Add($"[Ouvrir la vente]({_opt.PublicUrl}/ventes/{s.Id})");
            embed.AddField(Short($"{s.Reference} · {s.VehicleName} ({s.VehicleTypeLabel})", 250), string.Join("\n", lines));
        }
        await FollowupAsync(embed: embed.Build(), ephemeral: true);
    }

    [SlashCommand("tournee", "Voir ce qu'il reste à commander, aller chercher et livrer")]
    public async Task TourneeAsync()
    {
        await DeferAsync(ephemeral: true);
        var res = await _api.GetTourAsync(Context.User.Id);
        if (res.Data is null) { await ErrorAsync(res.Error); return; }

        var t = res.Data;
        var embed = new EmbedBuilder()
            .WithColor(Green)
            .WithTitle($"🕒 Prochaine tournée : {t.NextSlotLabel}")
            .WithUrl($"{_opt.PublicUrl}/tournee");
        foreach (var (emoji, g) in new[] { ("📦", t.ToOrder), ("🚚", t.ToFetch), ("🏁", t.Received) })
            embed.AddField($"{emoji} {g.Label} ({g.Items.Length})", List(g.Items));
        await FollowupAsync(embed: embed.Build(), ephemeral: true);
    }

    private Task ErrorAsync(string? error) =>
        FollowupAsync($"❌ {error ?? "Erreur inconnue."}", ephemeral: true);

    private static string List(string[] items)
    {
        if (items.Length == 0) return "Aucun";
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < items.Length; i++)
        {
            var line = $"• {items[i]}\n";
            if (sb.Length + line.Length > 990) { sb.Append($"… et {items.Length - i} autre(s)"); break; }
            sb.Append(line);
        }
        return sb.ToString().TrimEnd();
    }

    private static string Short(string s, int max) => s.Length <= max ? s : s[..(max - 1)] + "…";
}
