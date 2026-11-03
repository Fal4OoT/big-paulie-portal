using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace BigPaulie.Bot;

public sealed record ClientResult(Guid Id, string Name, string? Telephone, string? DateNaissance, int ActiveSaleCount);

public sealed record SaleResult(Guid Id, string Reference, string VehicleName, string VehicleTypeLabel, string ClientName,
    string Status, string StatusLabel, string? Plate, bool Immediate, bool PermitWarning, string SellerName, DateTime CreatedAt);

public sealed record TourGroup(string Label, string[] Items);

public sealed record TourResult(string NextSlotLabel, TourGroup ToOrder, TourGroup ToFetch, TourGroup Received);

/// <summary>Résultat d'appel : soit des données, soit un message d'erreur lisible.</summary>
public sealed record ApiResult<T>(T? Data, string? Error);

/// <summary>Client des endpoints /api/internal du portail.</summary>
public sealed class PortalApi
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;

    public PortalApi(HttpClient http, BotOptions opt)
    {
        _http = http;
        _http.BaseAddress = new Uri(opt.ApiUrl.TrimEnd('/') + "/");
        _http.DefaultRequestHeaders.Add("X-Internal-Key", opt.InternalApiKey);
        _http.Timeout = TimeSpan.FromSeconds(10);
    }

    public Task<ApiResult<List<ClientResult>>> SearchClientsAsync(ulong discordId, string q) =>
        GetAsync<List<ClientResult>>($"api/internal/clients?discordId={discordId}&q={Uri.EscapeDataString(q)}");

    public Task<ApiResult<List<SaleResult>>> SearchSalesAsync(ulong discordId, string q) =>
        GetAsync<List<SaleResult>>($"api/internal/sales?discordId={discordId}&q={Uri.EscapeDataString(q)}");

    public Task<ApiResult<TourResult>> GetTourAsync(ulong discordId) =>
        GetAsync<TourResult>($"api/internal/tour?discordId={discordId}");

    private async Task<ApiResult<T>> GetAsync<T>(string path)
    {
        try
        {
            using var res = await _http.GetAsync(path);
            if (res.IsSuccessStatusCode)
                return new(await res.Content.ReadFromJsonAsync<T>(Json), null);

            string? error = null;
            try
            {
                using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
                if (doc.RootElement.TryGetProperty("error", out var e)) error = e.GetString();
            }
            catch { /* corps non JSON */ }

            return new(default, error ?? (res.StatusCode == HttpStatusCode.Unauthorized
                ? "Le bot n'est pas autorisé par le portail (INTERNAL_API_KEY)."
                : $"Le portail a répondu {(int)res.StatusCode}."));
        }
        catch (Exception)
        {
            return new(default, "Le portail est injoignable pour le moment.");
        }
    }
}
