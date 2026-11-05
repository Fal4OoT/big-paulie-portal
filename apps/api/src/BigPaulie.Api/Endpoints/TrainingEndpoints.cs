using BigPaulie.Api.Auth;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

/// <summary>Fiches de formation : le métier, les procédures, les astuces. Contenu en Markdown simple.</summary>
public static class TrainingEndpoints
{
    public sealed class SheetInput
    {
        public string? Title { get; set; }
        public string? Category { get; set; }
        public string? Content { get; set; }
        public bool Published { get; set; }
        public int SortOrder { get; set; }
    }

    private sealed class SheetRow
    {
        public Guid Id { get; set; }
        public string Title { get; set; } = "";
        public string? Category { get; set; }
        public string Content { get; set; } = "";
        public bool Published { get; set; }
        public int SortOrder { get; set; }
        public string? CreatedByName { get; set; }
        public DateTime CreatedAt { get; set; }
        public string? UpdatedByName { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    private const string Select = """
        SELECT t.id, t.title, t.category, t.content, t.published, t.sort_order,
               cu.display_name AS created_by_name, t.created_at, uu.display_name AS updated_by_name, t.updated_at
        FROM training_sheets t
        LEFT JOIN users cu ON cu.id = t.created_by
        LEFT JOIN users uu ON uu.id = t.updated_by
        """;

    private static string? Validate(SheetInput i, out string title, out string? category, out string content)
    {
        title = i.Title?.Trim() ?? "";
        category = string.IsNullOrWhiteSpace(i.Category) ? null : i.Category.Trim();
        content = i.Content ?? "";
        if (title.Length is 0 or > 120) return "Le titre est obligatoire (120 caractères max).";
        if (category is { Length: > 40 }) return "Catégorie : 40 caractères max.";
        if (content.Length > 100_000) return "Contenu trop long (100 000 caractères max).";
        return null;
    }

    public static void MapTraining(this WebApplication app)
    {
        var g = app.MapGroup("/api/training");

        // Liste (sans le contenu). Les brouillons ne sont visibles que par ceux qui gèrent les formations.
        g.MapGet("/", async (HttpContext http, NpgsqlDataSource db) =>
        {
            var manage = http.Me().Has(Permissions.TrainingManage);
            await using var c = await db.OpenConnectionAsync();
            var rows = await c.QueryAsync<SheetRow>($"""
                {Select}
                WHERE t.published OR @manage
                ORDER BY coalesce(t.category, 'zzzz'), t.sort_order, lower(t.title)
                """, new { manage });
            return Results.Ok(rows.Select(r => new
            {
                r.Id,
                r.Title,
                r.Category,
                r.Published,
                r.SortOrder,
                r.UpdatedByName,
                r.UpdatedAt,
                // Extrait pour la recherche et l'aperçu de la liste.
                excerpt = Excerpt(r.Content),
                searchText = r.Content.Length > 20_000 ? r.Content[..20_000] : r.Content,
            }));
        }).RequirePerm(Permissions.TrainingView);

        g.MapGet("/{id:guid}", async (Guid id, HttpContext http, NpgsqlDataSource db) =>
        {
            var manage = http.Me().Has(Permissions.TrainingManage);
            await using var c = await db.OpenConnectionAsync();
            var row = await c.QuerySingleOrDefaultAsync<SheetRow>($"{Select} WHERE t.id = @id AND (t.published OR @manage)", new { id, manage });
            return row is null ? EndpointAuth.NotFound("Fiche introuvable.") : Results.Ok(row);
        }).RequirePerm(Permissions.TrainingView);

        g.MapPost("/", async (SheetInput input, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            if (Validate(input, out var title, out var category, out var content) is { } err) return EndpointAuth.Bad(err);
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var id = await c.ExecuteScalarAsync<Guid>("""
                INSERT INTO training_sheets (title, category, content, published, sort_order, created_by, updated_by)
                VALUES (@title, @category, @content, @Published, @SortOrder, @me, @me) RETURNING id
                """, new { title, category, content, input.Published, input.SortOrder, me = me.Id });
            await audit.LogAsync(me, "training.created", "training", id.ToString(), "Fiche de formation créée",
                $"**{title}**{(category is null ? "" : $" ({category})")}{(input.Published ? "" : " · brouillon")}", $"/formation/{id}");
            return Results.Ok(new { id });
        }).RequirePerm(Permissions.TrainingManage);

        g.MapPut("/{id:guid}", async (Guid id, SheetInput input, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            if (Validate(input, out var title, out var category, out var content) is { } err) return EndpointAuth.Bad(err);
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var wasPublished = await c.ExecuteScalarAsync<bool?>("SELECT published FROM training_sheets WHERE id = @id", new { id });
            if (wasPublished is null) return EndpointAuth.NotFound("Fiche introuvable.");
            await c.ExecuteAsync("""
                UPDATE training_sheets SET title = @title, category = @category, content = @content, published = @Published,
                       sort_order = @SortOrder, updated_by = @me, updated_at = now()
                WHERE id = @id
                """, new { id, title, category, content, input.Published, input.SortOrder, me = me.Id });
            var state = wasPublished != input.Published ? (input.Published ? " · publiée" : " · repassée en brouillon") : "";
            await audit.LogAsync(me, "training.updated", "training", id.ToString(), "Fiche de formation modifiée", $"**{title}**{state}", $"/formation/{id}");
            return Results.Ok(new { id });
        }).RequirePerm(Permissions.TrainingManage);

        g.MapDelete("/{id:guid}", async (Guid id, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var title = await c.ExecuteScalarAsync<string?>("DELETE FROM training_sheets WHERE id = @id RETURNING title", new { id });
            if (title is null) return EndpointAuth.NotFound("Fiche introuvable.");
            await audit.LogAsync(http.Me(), "training.deleted", "training", id.ToString(), "Fiche de formation supprimée", $"**{title}**");
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.TrainingManage);
    }

    /// <summary>Début du texte sans la syntaxe Markdown (titres, images, gras…).</summary>
    private static string Excerpt(string md)
    {
        var text = System.Text.RegularExpressions.Regex.Replace(md, @"!\[[^\]]*\]\([^)]*\)", " ");
        text = System.Text.RegularExpressions.Regex.Replace(text, @"\[([^\]]*)\]\([^)]*\)", "$1");
        text = System.Text.RegularExpressions.Regex.Replace(text, @"[#>*_`~\-]+", " ");
        text = System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ").Trim();
        return text.Length <= 180 ? text : text[..177] + "…";
    }
}
