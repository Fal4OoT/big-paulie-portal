using BigPaulie.Api.Auth;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

public static class MiscEndpoints
{
    private static readonly string[] AllowedImageTypes = { "image/png", "image/jpeg", "image/webp", "image/gif" };
    private const int MaxFileBytes = 8 * 1024 * 1024;

    private sealed class FileRow
    {
        public string ContentType { get; set; } = "";
        public byte[] Data { get; set; } = Array.Empty<byte>();
    }

    private sealed class AuditRow
    {
        public long Id { get; set; }
        public string ActorName { get; set; } = "";
        public string Action { get; set; } = "";
        public string Entity { get; set; } = "";
        public string? EntityId { get; set; }
        public string Summary { get; set; } = "";
        public DateTime At { get; set; }
    }

    public static void MapMisc(this WebApplication app)
    {
        // ---------- Tournée ----------
        app.MapGet("/api/tour", async (TourService tour) =>
        {
            var pending = await tour.PendingAsync(SaleStatus.ToOrder, SaleStatus.ToFetch, SaleStatus.Received);
            var next = tour.NextSlotUtc(DateTime.UtcNow);
            return Results.Ok(new
            {
                nextSlotUtc = DateTime.SpecifyKind(next, DateTimeKind.Utc),
                nextSlotLabel = tour.LocalHour(next),
                toOrder = pending.Where(s => s.Status == SaleStatus.ToOrder).Select(SaleEndpoints.ToDto),
                toFetch = pending.Where(s => s.Status == SaleStatus.ToFetch).Select(SaleEndpoints.ToDto),
                received = pending.Where(s => s.Status == SaleStatus.Received).Select(SaleEndpoints.ToDto),
            });
        }).RequirePerm(Permissions.TourView);

        // Envoi manuel de la liste dans le salon Discord (bouton de la page Tournée).
        app.MapPost("/api/tour/announce", async (HttpContext http, TourService tour, ConfigService config,
            BigPaulie.Api.Discord.DiscordNotifier notifier, AuditService audit) =>
        {
            var settings = await config.GetSettingsAsync();
            if (string.IsNullOrEmpty(settings.TourChannelId)) return EndpointAuth.Bad("Aucun salon de tournée configuré.");
            var pending = await tour.PendingAsync(SaleStatus.ToOrder, SaleStatus.ToFetch);
            notifier.Enqueue(settings.TourChannelId, tour.BuildMessage("📣 Point tournée (envoi manuel)",
                pending.Where(s => s.Status == SaleStatus.ToOrder).ToList(),
                pending.Where(s => s.Status == SaleStatus.ToFetch).ToList(), settings));
            await audit.LogAsync(http.Me(), "tour.announce", "tour", null, "Tournée annoncée", "Liste envoyée manuellement sur Discord.");
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.SalesAdvance);

        // ---------- Dashboard ----------
        app.MapGet("/api/dashboard", async (NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var counts = (await c.QueryAsync<(string Status, int Count)>("""
                SELECT s.status, count(*)::int FROM sales s JOIN clients c ON c.id = s.client_id
                WHERE c.deleted_at IS NULL AND (s.status IN ('TO_ORDER','TO_FETCH','RECEIVED') OR s.updated_at > now() - interval '24 hours')
                GROUP BY s.status
                """)).ToDictionary(x => x.Status, x => x.Count);
            var warnings = await c.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM sales WHERE permit_warning AND status IN ('TO_ORDER','TO_FETCH','RECEIVED')");
            var immediate = await c.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM sales WHERE immediate AND status IN ('TO_ORDER','TO_FETCH')");
            return Results.Ok(new { counts, permitWarnings = warnings, immediatePending = immediate });
        }).RequirePerm(Permissions.SalesView);

        // ---------- Fichiers (images de permis collées) ----------
        app.MapPost("/api/files", async (HttpRequest req, HttpContext http, NpgsqlDataSource db) =>
        {
            var me = http.Me();
            if (!me.Has(Permissions.ClientsCreate) && !me.Has(Permissions.ClientsEdit) && !me.Has(Permissions.SalesEdit))
                return EndpointAuth.Forbidden();
            if (!req.HasFormContentType) return EndpointAuth.Bad("Envoi attendu en multipart/form-data.");

            var form = await req.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file is null || file.Length == 0) return EndpointAuth.Bad("Aucune image reçue.");
            if (file.Length > MaxFileBytes) return EndpointAuth.Bad("Image trop lourde (8 Mo maximum).");

            await using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var bytes = ms.ToArray();
            var type = DetectImageType(bytes);
            if (type is null || !AllowedImageTypes.Contains(type)) return EndpointAuth.Bad("Format non accepté (PNG, JPEG, WEBP ou GIF).");

            await using var c = await db.OpenConnectionAsync();
            var id = await c.ExecuteScalarAsync<Guid>(
                "INSERT INTO files (content_type, size, data, created_by) VALUES (@type, @size, @bytes, @me) RETURNING id",
                new { type, size = bytes.Length, bytes, me = me.Id == Guid.Empty ? (Guid?)null : me.Id });
            return Results.Ok(new { id });
        }).RequirePerm().DisableAntiforgery();

        app.MapGet("/api/files/{id:guid}", async (Guid id, NpgsqlDataSource db, HttpContext http) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var f = await c.QuerySingleOrDefaultAsync<FileRow>("SELECT content_type, data FROM files WHERE id = @id", new { id });
            if (f is null) return EndpointAuth.NotFound();
            http.Response.Headers.CacheControl = "private, max-age=86400";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            return Results.File(f.Data, f.ContentType);
        }).RequirePerm(Permissions.ClientsView);

        // ---------- Logs ----------
        app.MapGet("/api/audit", async (NpgsqlDataSource db, string? q, long? before, int? limit) =>
        {
            var p = new DynamicParameters();
            p.Add("limit", Math.Clamp(limit ?? 100, 1, 500));
            var where = "WHERE 1=1";
            if (before is not null) { where += " AND id < @before"; p.Add("before", before); }
            where += ClientEndpoints.SearchClause("lower(actor_name || ' ' || summary)", q, p);
            await using var c = await db.OpenConnectionAsync();
            var rows = await c.QueryAsync<AuditRow>(
                $"SELECT id, actor_name, action, entity, entity_id, summary, at FROM audit_logs {where} ORDER BY id DESC LIMIT @limit", p);
            return Results.Ok(rows);
        }).RequirePerm(Permissions.LogsView);
    }

    /// <summary>Type réel d'après les premiers octets (on ne fait pas confiance au type annoncé).</summary>
    private static string? DetectImageType(byte[] b)
    {
        if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return "image/png";
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
        if (b.Length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        if (b.Length >= 6 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F') return "image/gif";
        return null;
    }
}
