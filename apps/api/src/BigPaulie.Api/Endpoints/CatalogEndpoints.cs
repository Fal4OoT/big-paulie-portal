using System.Text.Json;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

/// <summary>
/// Catalogue de véhicules importé depuis le panel légal du serveur.
/// On colle la réponse JSON du panel ; seuls les noms et les catégories des véhicules sont lus
/// (le reste : employés, comptabilité… est ignoré et jamais stocké).
/// </summary>
public static class CatalogEndpoints
{
    public sealed class ImportInput
    {
        public string? Json { get; set; }
        /// <summary>false = aperçu uniquement, true = applique l'import.</summary>
        public bool Apply { get; set; }
    }

    public sealed class SegmentInput
    {
        public string Emoji { get; set; } = "";
        public string? Label { get; set; }
        public Guid? VehicleTypeId { get; set; }
    }

    private sealed class SegmentRow
    {
        public string Emoji { get; set; } = "";
        public string Label { get; set; } = "";
        public Guid? VehicleTypeId { get; set; }
        public int SortOrder { get; set; }
        public int VehicleCount { get; set; }
    }

    private sealed class CatalogRow
    {
        public Guid Id { get; set; }
        public string ExternalId { get; set; } = "";
        public string Name { get; set; } = "";
        public string? SegmentEmoji { get; set; }
        public bool Active { get; set; }
    }

    private sealed record ParsedVehicle(string ExternalId, string Name, string? Segment, int Position, bool Active);

    public static void MapCatalog(this WebApplication app)
    {
        // Liste pour la recherche du formulaire d'achat.
        app.MapGet("/api/catalog", async (NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var rows = await c.QueryAsync("""
                SELECT cv.id, cv.name, cv.segment_emoji, cs.label AS segment_label, cs.vehicle_type_id
                FROM catalog_vehicles cv
                LEFT JOIN catalog_segments cs ON cs.emoji = cv.segment_emoji
                WHERE cv.active
                ORDER BY lower(cv.name)
                """);
            return Results.Ok(rows.Select(r => new
            {
                id = (Guid)r.id,
                name = (string)r.name,
                segmentEmoji = (string?)r.segment_emoji,
                segmentLabel = (string?)r.segment_label,
                vehicleTypeId = (Guid?)r.vehicle_type_id,
            }));
        }).RequirePerm(Permissions.SalesView);

        var g = app.MapGroup("/api/admin/catalog").RequirePerm(Permissions.ConfigManage);

        g.MapGet("/", async (NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var segments = await c.QueryAsync<SegmentRow>("""
                SELECT cs.emoji, cs.label, cs.vehicle_type_id, cs.sort_order,
                       (SELECT count(*)::int FROM catalog_vehicles cv WHERE cv.segment_emoji = cs.emoji AND cv.active) AS vehicle_count
                FROM catalog_segments cs ORDER BY cs.sort_order, cs.label
                """);
            var stats = await c.QuerySingleAsync<(int Active, int Inactive, DateTime? LastImport)>("""
                SELECT count(*) FILTER (WHERE active)::int, count(*) FILTER (WHERE NOT active)::int, max(imported_at)
                FROM catalog_vehicles
                """);
            var noSegment = await c.ExecuteScalarAsync<int>("SELECT count(*)::int FROM catalog_vehicles WHERE active AND segment_emoji IS NULL");
            var offCatalog = await c.ExecuteScalarAsync<int>("SELECT count(*)::int FROM sales WHERE catalog_vehicle_id IS NULL AND status <> 'CANCELLED'");
            return Results.Ok(new
            {
                segments,
                activeCount = stats.Active,
                inactiveCount = stats.Inactive,
                lastImportAt = stats.LastImport,
                withoutSegment = noSegment,
                offCatalogSales = offCatalog,
            });
        });

        g.MapPut("/segments", async (List<SegmentInput> input, HttpContext http, NpgsqlDataSource db, ConfigService config, AuditService audit) =>
        {
            var types = await config.GetVehicleTypesAsync();
            await using var c = await db.OpenConnectionAsync();
            await using var tx = await c.BeginTransactionAsync();
            foreach (var s in input)
            {
                var label = s.Label?.Trim() ?? "";
                if (label.Length is 0 or > 40) return EndpointAuth.Bad("Chaque gamme doit avoir un nom (40 caractères max).");
                if (s.VehicleTypeId is { } tid && types.All(t => t.Id != tid)) return EndpointAuth.Bad($"Type invalide pour « {label} ».");
                await c.ExecuteAsync("UPDATE catalog_segments SET label = @label, vehicle_type_id = @VehicleTypeId WHERE emoji = @Emoji",
                    new { label, s.VehicleTypeId, s.Emoji }, tx);
            }
            await tx.CommitAsync();
            await audit.LogAsync(http.Me(), "config.catalog", "config", null, "Configuration modifiée", "Gammes du catalogue mises à jour.");
            return Results.Ok(new { ok = true });
        });

        g.MapPost("/import", async (ImportInput input, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            if (string.IsNullOrWhiteSpace(input.Json)) return EndpointAuth.Bad("Colle la réponse du panel.");
            if (input.Json.Length > 20_000_000) return EndpointAuth.Bad("Contenu trop volumineux.");

            List<ParsedVehicle> parsed;
            string? company;
            try { (parsed, company) = Parse(input.Json); }
            catch (JsonException) { return EndpointAuth.Bad("Ce n'est pas du JSON valide. Copie bien toute la réponse (clic droit → Copy response)."); }
            catch (FormatException ex) { return EndpointAuth.Bad(ex.Message); }

            if (parsed.Count == 0) return EndpointAuth.Bad("Aucun véhicule trouvé dans ce contenu.");

            await using var c = await db.OpenConnectionAsync();
            var existing = (await c.QueryAsync<CatalogRow>("SELECT id, external_id, name, segment_emoji, active FROM catalog_vehicles"))
                .ToDictionary(r => r.ExternalId);
            var knownSegments = (await c.QueryAsync<string>("SELECT emoji FROM catalog_segments")).ToHashSet();

            var incoming = parsed.ToDictionary(p => p.ExternalId);
            var added = parsed.Where(p => !existing.ContainsKey(p.ExternalId)).Select(p => p.Name).ToList();
            var renamed = parsed.Where(p => existing.TryGetValue(p.ExternalId, out var e) && e.Name != p.Name)
                                .Select(p => new { from = existing[p.ExternalId].Name, to = p.Name }).ToList();
            var moved = parsed.Count(p => existing.TryGetValue(p.ExternalId, out var e) && e.SegmentEmoji != p.Segment);
            var reactivated = parsed.Where(p => p.Active && existing.TryGetValue(p.ExternalId, out var e) && !e.Active).Select(p => p.Name).ToList();
            var removed = existing.Values.Where(e => e.Active && (!incoming.TryGetValue(e.ExternalId, out var p) || !p.Active))
                                         .Select(e => e.Name).OrderBy(n => n).ToList();
            var unknownSegments = parsed.Where(p => p.Segment is not null && !knownSegments.Contains(p.Segment))
                                        .Select(p => p.Segment!).Distinct().ToList();

            var preview = new
            {
                company,
                total = parsed.Count(p => p.Active),
                added = added.OrderBy(n => n).ToList(),
                renamed,
                movedSegment = moved,
                reactivated,
                removed,
                unknownSegments,
                applied = false,
                linkedSales = 0,
            };
            if (!input.Apply) return Results.Ok(preview);

            await using var tx = await c.BeginTransactionAsync();
            var order = 1000;
            foreach (var emoji in unknownSegments)
                await c.ExecuteAsync("INSERT INTO catalog_segments (emoji, label, sort_order) VALUES (@emoji, @emoji, @order) ON CONFLICT DO NOTHING",
                    new { emoji, order = order++ }, tx);

            foreach (var p in parsed)
                await c.ExecuteAsync("""
                    INSERT INTO catalog_vehicles (external_id, name, segment_emoji, sort_order, active, imported_at)
                    VALUES (@ExternalId, @Name, @Segment, @Position, @Active, now())
                    ON CONFLICT (external_id) DO UPDATE SET name = EXCLUDED.name, segment_emoji = EXCLUDED.segment_emoji,
                        sort_order = EXCLUDED.sort_order, active = EXCLUDED.active, imported_at = now()
                    """, p, tx);

            // Retirés du panel : désactivés (jamais supprimés, des ventes peuvent y être rattachées).
            var ids = parsed.Select(p => p.ExternalId).ToArray();
            await c.ExecuteAsync("UPDATE catalog_vehicles SET active = false WHERE NOT (external_id = ANY(@ids))", new { ids }, tx);

            // Rattache les anciennes ventes saisies à la main dont le nom correspond exactement à un seul véhicule.
            var linked = await c.ExecuteAsync("""
                UPDATE sales s SET catalog_vehicle_id = m.id
                FROM (
                    SELECT lower(name) AS lname, min(id::text)::uuid AS id
                    FROM catalog_vehicles WHERE active
                    GROUP BY lower(name) HAVING count(*) = 1
                ) m
                WHERE s.catalog_vehicle_id IS NULL AND lower(trim(s.vehicle_name)) = m.lname
                """, transaction: tx);
            await tx.CommitAsync();

            await audit.LogAsync(http.Me(), "config.catalog", "config", null, "Catalogue importé",
                $"{preview.total} véhicule(s) actif(s) · {added.Count} ajouté(s) · {renamed.Count} renommé(s) · {removed.Count} retiré(s)" +
                (linked > 0 ? $" · {linked} ancienne(s) vente(s) rattachée(s)" : ""));

            return Results.Ok(preview with { applied = true, linkedSales = linked });
        });
    }

    /// <summary>
    /// Lit la réponse du panel : <c>products</c> (id, name, active, displayPosition) et
    /// <c>dealership.vehicles</c> (product_id → catégorie). Accepte aussi un simple tableau de produits.
    /// </summary>
    private static (List<ParsedVehicle> Vehicles, string? Company) Parse(string json)
    {
        using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { AllowTrailingCommas = true });
        var root = doc.RootElement;

        JsonElement products;
        string? company = null;
        var categories = new Dictionary<string, string>();

        if (root.ValueKind == JsonValueKind.Array) products = root;
        else if (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("products", out var p) && p.ValueKind == JsonValueKind.Array)
        {
            products = p;
            if (root.TryGetProperty("company", out var co) && co.ValueKind == JsonValueKind.Object && co.TryGetProperty("name", out var cn))
                company = cn.GetString();
            if (root.TryGetProperty("dealership", out var dealer) && dealer.ValueKind == JsonValueKind.Object
                && dealer.TryGetProperty("vehicles", out var vehicles) && vehicles.ValueKind == JsonValueKind.Array)
            {
                foreach (var v in vehicles.EnumerateArray())
                    if (Str(v, "product_id") is { } pid && Str(v, "category") is { Length: > 0 } cat)
                        categories[pid] = cat.Trim();
            }
        }
        else throw new FormatException("Format non reconnu : la réponse doit contenir une liste « products ».");

        var result = new List<ParsedVehicle>();
        var seen = new HashSet<string>();
        foreach (var item in products.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var id = Str(item, "id");
            var name = Str(item, "name")?.Trim();
            if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(name) || !seen.Add(id)) continue;
            // Quand le panel fournit la liste des véhicules de la concession, on ne garde que ceux-là.
            if (categories.Count > 0 && !categories.ContainsKey(id)) continue;

            var active = !item.TryGetProperty("active", out var a) || a.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Number => a.GetDouble() != 0,
                _ => true,
            };
            var position = item.TryGetProperty("displayPosition", out var dp) && dp.ValueKind == JsonValueKind.Number && dp.TryGetInt32(out var pos) ? pos : 0;
            if (name.Length > 120) name = name[..120];

            result.Add(new ParsedVehicle(id, name, categories.GetValueOrDefault(id), position, active));
        }
        return (result, company);
    }

    private static string? Str(JsonElement e, string prop) =>
        e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
