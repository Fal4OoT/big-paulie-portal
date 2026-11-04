using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using BigPaulie.Api.Domain;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

/// <summary>
/// Valide et normalise les valeurs saisies pour un modèle configurable (client ou vente).
/// Les clés inconnues sont ignorées ; les valeurs sont stockées dans une colonne jsonb.
/// </summary>
public static class FieldValidator
{
    public sealed record Result(JsonObject Data, List<string> Errors);

    /// <param name="previous">Données existantes : les champs désactivés depuis sont conservés tels quels.</param>
    public static async Task<Result> ValidateAsync(IReadOnlyList<FieldDefinition> fields, JsonObject? input,
        NpgsqlConnection conn, JsonObject? previous = null)
    {
        var errors = new List<string>();
        var output = new JsonObject();

        // Conserve les anciennes valeurs dont le champ n'existe plus (pas de perte silencieuse).
        if (previous is not null)
            foreach (var (k, v) in previous)
                if (fields.All(f => f.Key != k)) output[k] = v?.DeepClone();

        input ??= new JsonObject();

        foreach (var f in fields)
        {
            input.TryGetPropertyValue(f.Key, out var raw);
            var str = raw is JsonValue jv && jv.TryGetValue<string>(out var s) ? s.Trim() : raw?.ToJsonString();
            var empty = raw is null || (raw is JsonValue v0 && v0.TryGetValue<string>(out var s0) && string.IsNullOrWhiteSpace(s0));

            if (f.Type == "checkbox")
            {
                var b = raw is JsonValue bv && bv.TryGetValue<bool>(out var bb) ? bb
                      : str is "true" or "1" or "oui";
                if (f.Required && !b) errors.Add($"« {f.Label} » doit être coché.");
                output[f.Key] = b;
                continue;
            }

            if (empty)
            {
                if (f.Required) errors.Add($"« {f.Label} » est obligatoire.");
                continue;
            }

            switch (f.Type)
            {
                case "date":
                    if (!DateOnly.TryParseExact(str, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                        errors.Add($"« {f.Label} » : date invalide.");
                    else if (d > DateOnly.FromDateTime(DateTime.UtcNow).AddYears(1) || d.Year < 1900)
                        errors.Add($"« {f.Label} » : date hors limites.");
                    else output[f.Key] = d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                    break;

                case "number":
                    if (!decimal.TryParse(str?.Replace(',', '.').Replace(" ", ""), NumberStyles.Number, CultureInfo.InvariantCulture, out var n))
                        errors.Add($"« {f.Label} » : nombre invalide.");
                    else output[f.Key] = n;
                    break;

                case "select":
                    if (f.Options.Length > 0 && !f.Options.Contains(str))
                        errors.Add($"« {f.Label} » : valeur non proposée.");
                    else output[f.Key] = str;
                    break;

                case "image":
                    if (!Guid.TryParse(str, out var fileId)
                        || !await conn.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM files WHERE id = @fileId)", new { fileId }))
                        errors.Add($"« {f.Label} » : image introuvable, recolle-la.");
                    else output[f.Key] = fileId.ToString();
                    break;

                case "phone":
                    // Stocké en 10 chiffres (5209250963), affiché (520)925-0963.
                    var digits = new string(str!.Where(char.IsDigit).ToArray());
                    if (digits.Length != 10) errors.Add($"« {f.Label} » : 10 chiffres attendus (ex : 5209250963).");
                    else output[f.Key] = digits;
                    break;

                default: // text, textarea
                    var max = f.Type == "textarea" ? 4000 : 200;
                    if (str!.Length > max) errors.Add($"« {f.Label} » : {max} caractères maximum.");
                    else output[f.Key] = str;
                    break;
            }
        }

        return new Result(output, errors);
    }

    public static JsonObject ParseObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new JsonObject();
        return JsonNode.Parse(json) as JsonObject ?? new JsonObject();
    }

    public static string? GetString(JsonObject data, string key) =>
        data.TryGetPropertyValue(key, out var n) && n is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    /// <summary>Texte de recherche : toutes les valeurs textuelles, en minuscules (hors images).</summary>
    public static string BuildSearchText(IReadOnlyList<FieldDefinition> fields, JsonObject data)
    {
        var parts = fields.Where(f => f.Type is "text" or "phone" or "date" or "select" or "number")
            .Select(f => data.TryGetPropertyValue(f.Key, out var n) ? n?.ToString() : null)
            .Where(s => !string.IsNullOrWhiteSpace(s));
        return string.Join(' ', parts).ToLowerInvariant();
    }
}
