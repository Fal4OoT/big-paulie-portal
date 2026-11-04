using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using BigPaulie.Api.Infrastructure;

namespace BigPaulie.Api.Discord;

public sealed record DiscordUser(string Id, string Username, string? GlobalName, string? Avatar);

public sealed record DiscordMember(string[] Roles, string? Nick);

public sealed record DiscordRole(string Id, string Name, int Position, int Color, bool Managed);

public sealed record DiscordChannel(string Id, string Name, int Type, int Position);

/// <summary>Accès REST à l'API Discord (OAuth2 + bot). Aucune connexion gateway ici : c'est le rôle du bot.</summary>
public sealed class DiscordRestClient
{
    private const string Base = "https://discord.com/api/v10";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _http;
    private readonly PortalOptions _opt;
    private readonly ILogger<DiscordRestClient> _log;

    public DiscordRestClient(HttpClient http, PortalOptions opt, ILogger<DiscordRestClient> log)
    {
        _http = http;
        _opt = opt;
        _log = log;
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("DiscordBot (https://github.com, 1.0) BigPauliePortal");
    }

    // ---------- OAuth2 ----------

    public string BuildAuthorizeUrl(string state) =>
        "https://discord.com/oauth2/authorize" +
        $"?client_id={Uri.EscapeDataString(_opt.DiscordClientId)}" +
        $"&redirect_uri={Uri.EscapeDataString(_opt.RedirectUri)}" +
        "&response_type=code&scope=identify&prompt=none" +
        $"&state={Uri.EscapeDataString(state)}";

    public async Task<DiscordUser?> ExchangeCodeForUserAsync(string code, CancellationToken ct)
    {
        using var tokenReq = new HttpRequestMessage(HttpMethod.Post, $"{Base}/oauth2/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = _opt.DiscordClientId,
                ["client_secret"] = _opt.DiscordClientSecret,
                ["grant_type"] = "authorization_code",
                ["code"] = code,
                ["redirect_uri"] = _opt.RedirectUri,
            }),
        };
        using var tokenRes = await _http.SendAsync(tokenReq, ct);
        if (!tokenRes.IsSuccessStatusCode)
        {
            _log.LogWarning("Échange OAuth2 Discord refusé : {Status} {Body}", tokenRes.StatusCode, await tokenRes.Content.ReadAsStringAsync(ct));
            return null;
        }

        using var tokenDoc = JsonDocument.Parse(await tokenRes.Content.ReadAsStringAsync(ct));
        var accessToken = tokenDoc.RootElement.GetProperty("access_token").GetString();

        using var meReq = new HttpRequestMessage(HttpMethod.Get, $"{Base}/users/@me");
        meReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var meRes = await _http.SendAsync(meReq, ct);
        if (!meRes.IsSuccessStatusCode) return null;

        return JsonSerializer.Deserialize<DiscordUser>(await meRes.Content.ReadAsStringAsync(ct), Json);
    }

    // ---------- Bot ----------

    private HttpRequestMessage BotRequest(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, $"{Base}{path}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bot", _opt.DiscordBotToken);
        return req;
    }

    /// <summary>Membre du serveur. Renvoie null si l'utilisateur n'est pas sur le serveur.
    /// Lève une exception si Discord est injoignable (pour ne pas confondre panne et absence).</summary>
    public async Task<DiscordMember?> GetMemberAsync(string userId, CancellationToken ct)
    {
        using var req = BotRequest(HttpMethod.Get, $"/guilds/{_opt.DiscordGuildId}/members/{userId}");
        using var res = await _http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.NotFound) return null;
        res.EnsureSuccessStatusCode();
        return JsonSerializer.Deserialize<DiscordMember>(await res.Content.ReadAsStringAsync(ct), Json);
    }

    public async Task<IReadOnlyList<DiscordRole>> GetRolesAsync(CancellationToken ct)
    {
        using var req = BotRequest(HttpMethod.Get, $"/guilds/{_opt.DiscordGuildId}/roles");
        using var res = await _http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
        var roles = JsonSerializer.Deserialize<List<DiscordRole>>(await res.Content.ReadAsStringAsync(ct), Json) ?? new();
        return roles.Where(r => r.Id != _opt.DiscordGuildId && !r.Managed) // ni @everyone ni rôles de bots
                    .OrderByDescending(r => r.Position).ToList();
    }

    public async Task<IReadOnlyList<DiscordChannel>> GetTextChannelsAsync(CancellationToken ct)
    {
        using var req = BotRequest(HttpMethod.Get, $"/guilds/{_opt.DiscordGuildId}/channels");
        using var res = await _http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
        var channels = JsonSerializer.Deserialize<List<DiscordChannel>>(await res.Content.ReadAsStringAsync(ct), Json) ?? new();
        return channels.Where(c => c.Type is 0 or 5).OrderBy(c => c.Position).ToList(); // texte + annonces
    }

    public enum EditResult { Ok, NotFound, Failed }

    /// <summary>Publie un message et renvoie son identifiant (null en cas d'échec).</summary>
    public async Task<string?> CreateMessageAsync(string channelId, object payload, CancellationToken ct)
    {
        using var res = await SendWithRetryAsync(HttpMethod.Post, $"/channels/{channelId}/messages", payload, ct);
        if (!res.IsSuccessStatusCode)
        {
            _log.LogWarning("Publication Discord échouée dans {Channel} : {Status} {Body}", channelId, res.StatusCode, await res.Content.ReadAsStringAsync(ct));
            return null;
        }
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        return doc.RootElement.GetProperty("id").GetString();
    }

    public async Task<EditResult> EditMessageAsync(string channelId, string messageId, object payload, CancellationToken ct)
    {
        using var res = await SendWithRetryAsync(HttpMethod.Patch, $"/channels/{channelId}/messages/{messageId}", payload, ct);
        if (res.IsSuccessStatusCode) return EditResult.Ok;
        if (res.StatusCode is HttpStatusCode.NotFound) return EditResult.NotFound; // message supprimé à la main
        _log.LogWarning("Modification Discord échouée ({Channel}/{Message}) : {Status} {Body}", channelId, messageId, res.StatusCode, await res.Content.ReadAsStringAsync(ct));
        return EditResult.Failed;
    }

    public async Task DeleteMessageAsync(string channelId, string messageId, CancellationToken ct)
    {
        using var res = await SendWithRetryAsync(HttpMethod.Delete, $"/channels/{channelId}/messages/{messageId}", null, ct);
        if (!res.IsSuccessStatusCode && res.StatusCode != HttpStatusCode.NotFound)
            _log.LogWarning("Suppression Discord échouée ({Channel}/{Message}) : {Status}", channelId, messageId, res.StatusCode);
    }

    /// <summary>Requête bot avec une nouvelle tentative en cas de rate limit (429).</summary>
    private async Task<HttpResponseMessage> SendWithRetryAsync(HttpMethod method, string path, object? payload, CancellationToken ct)
    {
        var body = payload is null ? null : JsonSerializer.Serialize(payload, Json);
        for (var attempt = 0; ; attempt++)
        {
            var req = BotRequest(method, path);
            if (body is not null) req.Content = new StringContent(body, Encoding.UTF8, "application/json");
            var res = await _http.SendAsync(req, ct);
            req.Dispose();
            if ((int)res.StatusCode != 429 || attempt > 0) return res;

            var wait = 2.0;
            try
            {
                using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
                if (doc.RootElement.TryGetProperty("retry_after", out var ra)) wait = ra.GetDouble();
            }
            catch { /* on garde 2 s */ }
            res.Dispose();
            await Task.Delay(TimeSpan.FromSeconds(Math.Min(wait + 0.2, 30)), ct);
        }
    }

    /// <summary>Envoie un message dans un salon. Gère une fois le rate limit (429).</summary>
    public async Task SendMessageAsync(string channelId, object payload, CancellationToken ct)
    {
        var body = JsonSerializer.Serialize(payload, Json);
        for (var attempt = 0; attempt < 2; attempt++)
        {
            using var req = BotRequest(HttpMethod.Post, $"/channels/{channelId}/messages");
            req.Content = new StringContent(body, Encoding.UTF8, "application/json");
            using var res = await _http.SendAsync(req, ct);
            if (res.IsSuccessStatusCode) return;

            if ((int)res.StatusCode == 429 && attempt == 0)
            {
                var wait = 2.0;
                try
                {
                    using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
                    if (doc.RootElement.TryGetProperty("retry_after", out var ra)) wait = ra.GetDouble();
                }
                catch { /* on garde 2 s */ }
                await Task.Delay(TimeSpan.FromSeconds(Math.Min(wait + 0.2, 30)), ct);
                continue;
            }

            _log.LogWarning("Envoi Discord échoué dans {Channel} : {Status} {Body}", channelId, res.StatusCode, await res.Content.ReadAsStringAsync(ct));
            return;
        }
    }
}
