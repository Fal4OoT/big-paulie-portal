using System.Text.Json;
using BigPaulie.Api.Domain;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

/// <summary>Lecture de la configuration (modèles, types, grades, réglages). Petit volume : lu directement en base.</summary>
public sealed class ConfigService
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly NpgsqlDataSource _db;

    public ConfigService(NpgsqlDataSource db) => _db = db;

    public async Task<PortalSettings> GetSettingsAsync()
    {
        await using var c = await _db.OpenConnectionAsync();
        var json = await c.ExecuteScalarAsync<string?>("SELECT value::text FROM settings WHERE key = 'portal'");
        var s = json is null ? new PortalSettings() : JsonSerializer.Deserialize<PortalSettings>(json, Json) ?? new PortalSettings();

        // Garantit la présence de chaque statut, même si le JSON a été modifié à la main.
        foreach (var code in SaleStatus.All)
            if (s.Statuses.All(x => x.Code != code))
                s.Statuses.Add(new StatusSetting { Code = code, Label = code, Color = "#888888" });
        s.Statuses = s.Statuses.Where(x => SaleStatus.IsValid(x.Code))
                               .OrderBy(x => Array.IndexOf(SaleStatus.All, x.Code)).ToList();
        return s;
    }

    public async Task SaveSettingsAsync(PortalSettings s)
    {
        await using var c = await _db.OpenConnectionAsync();
        await c.ExecuteAsync(
            "INSERT INTO settings (key, value) VALUES ('portal', @v::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            new { v = JsonSerializer.Serialize(s, Json) });
    }

    public async Task<List<FieldDefinition>> GetFieldsAsync(string entity)
    {
        await using var c = await _db.OpenConnectionAsync();
        return (await c.QueryAsync<FieldDefinition>(
            "SELECT * FROM field_definitions WHERE entity = @entity ORDER BY sort_order, label", new { entity })).ToList();
    }

    public async Task<List<VehicleCategory>> GetCategoriesAsync()
    {
        await using var c = await _db.OpenConnectionAsync();
        return (await c.QueryAsync<VehicleCategory>("SELECT * FROM vehicle_categories ORDER BY sort_order, label")).ToList();
    }

    public async Task<List<VehicleType>> GetVehicleTypesAsync()
    {
        await using var c = await _db.OpenConnectionAsync();
        return (await c.QueryAsync<VehicleType>("SELECT * FROM vehicle_types ORDER BY sort_order, label")).ToList();
    }

    public async Task<List<GradeRow>> GetGradesAsync()
    {
        await using var c = await _db.OpenConnectionAsync();
        return (await c.QueryAsync<GradeRow>("SELECT id, name, discord_role_id, priority, is_staff, permissions FROM grades ORDER BY priority DESC, name")).ToList();
    }
}
