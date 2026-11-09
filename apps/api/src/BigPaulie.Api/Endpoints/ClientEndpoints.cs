using System.Text.Json.Nodes;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

public static class ClientEndpoints
{
    public sealed class ClientInput
    {
        public JsonObject? Data { get; set; }
        /// <summary>Confirme la création malgré un doublon potentiel.</summary>
        public bool Force { get; set; }
        /// <summary>Parrain choisi à la création (facultatif).</summary>
        public Guid? SponsorId { get; set; }
    }

    private sealed class ClientRow
    {
        public Guid Id { get; set; }
        public string DataJson { get; set; } = "{}";
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string? CreatedByName { get; set; }
        public string? UpdatedByName { get; set; }
        public int SaleCount { get; set; }
        public int ActiveSaleCount { get; set; }
    }

    private const string SelectClient = """
        SELECT c.id, c.data::text AS data_json, c.created_at, c.updated_at,
               cu.display_name AS created_by_name, uu.display_name AS updated_by_name,
               (SELECT count(*)::int FROM sales s WHERE s.client_id = c.id) AS sale_count,
               (SELECT count(*)::int FROM sales s WHERE s.client_id = c.id AND s.status IN ('TO_ORDER','TO_FETCH','RECEIVED')) AS active_sale_count
        FROM clients c
        LEFT JOIN users cu ON cu.id = c.created_by
        LEFT JOIN users uu ON uu.id = c.updated_by
        """;

    public static string FullName(JsonObject data) =>
        $"{FieldValidator.GetString(data, "prenom")} {FieldValidator.GetString(data, "nom")}".Trim() is { Length: > 0 } n ? n : "Client sans nom";

    private static object ToDto(ClientRow r)
    {
        var data = FieldValidator.ParseObject(r.DataJson);
        return new
        {
            r.Id,
            name = FullName(data),
            data,
            r.CreatedAt,
            r.UpdatedAt,
            r.CreatedByName,
            r.UpdatedByName,
            r.SaleCount,
            r.ActiveSaleCount,
        };
    }

    /// <summary>Ajoute une condition « chaque mot est présent » sur une colonne de recherche.</summary>
    public static string SearchClause(string column, string? q, DynamicParameters p)
    {
        if (string.IsNullOrWhiteSpace(q)) return "";
        var terms = q.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(6).ToArray();
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < terms.Length; i++)
        {
            var escaped = terms[i].Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
            p.Add($"t{i}", $"%{escaped}%");
            sb.Append($" AND {column} LIKE @t{i}");
        }
        return sb.ToString();
    }

    public static void MapClients(this WebApplication app)
    {
        var g = app.MapGroup("/api/clients");

        g.MapGet("/", async (NpgsqlDataSource db, string? q, int? limit, string? sort, string? dir) =>
        {
            var p = new DynamicParameters();
            p.Add("limit", Math.Clamp(limit ?? 100, 1, 1000));
            var where = "WHERE c.deleted_at IS NULL" + SearchClause("c.search_text", q, p);
            // Tri sur toute la base (liste blanche de colonnes), les valeurs vides toujours à la fin.
            var column = sort switch
            {
                // Accents ignorés (« Élodie » avec les E), quel que soit le classement de la base.
                "name" => "translate(lower(trim(coalesce(c.data->>'prenom','') || ' ' || coalesce(c.data->>'nom',''))), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')",
                "phone" => "nullif(c.data->>'telephone', '')",
                "birth" => "nullif(c.data->>'date_naissance', '')",
                "sales" => "sale_count",
                "created" => "c.created_at",
                _ => "c.updated_at",
            };
            var direction = dir == "asc" ? "ASC" : dir == "desc" ? "DESC" : sort is null or "updated" or "created" or "sales" ? "DESC" : "ASC";
            await using var c = await db.OpenConnectionAsync();
            var rows = await c.QueryAsync<ClientRow>(
                $"{SelectClient} {where} ORDER BY {column} {direction} NULLS LAST, c.created_at DESC LIMIT @limit", p);
            return Results.Ok(rows.Select(ToDto));
        }).RequirePerm(Permissions.ClientsView);

        g.MapGet("/{id:guid}", async (Guid id, NpgsqlDataSource db) =>
        {
            await using var c = await db.OpenConnectionAsync();
            var row = await c.QuerySingleOrDefaultAsync<ClientRow>($"{SelectClient} WHERE c.id = @id AND c.deleted_at IS NULL", new { id });
            return row is null ? EndpointAuth.NotFound("Client introuvable.") : Results.Ok(ToDto(row));
        }).RequirePerm(Permissions.ClientsView);

        // Vérification de doublons à la volée (formulaire de création / modification).
        g.MapPost("/duplicates", async (ClientInput input, NpgsqlDataSource db, Guid? excludeId) =>
        {
            await using var c = await db.OpenConnectionAsync();
            return Results.Ok(await FindDuplicatesAsync(c, input.Data ?? new JsonObject(), excludeId));
        }).RequirePerm(Permissions.ClientsView);

        g.MapPost("/", async (ClientInput input, HttpContext http, NpgsqlDataSource db, ConfigService config, AuditService audit,
            BigPaulie.Api.Infrastructure.PortalOptions opt) =>
        {
            var me = http.Me();
            if (input.SponsorId is not null && !me.Has(Permissions.ReferralsManage))
                return EndpointAuth.Forbidden("Ton grade ne permet pas d'enregistrer un parrainage.");
            var fields = await config.GetFieldsAsync("client");
            await using var c = await db.OpenConnectionAsync();

            var v = await FieldValidator.ValidateAsync(fields, input.Data, c);
            if (v.Errors.Count > 0) return EndpointAuth.Bad(string.Join("\n", v.Errors));

            if (!input.Force)
            {
                var dups = await FindDuplicatesAsync(c, v.Data, null);
                if (dups.Count > 0) return EndpointAuth.Conflict("Un client similaire existe déjà.", dups);
            }

            // Fiche et parrainage dans la même transaction : si le parrain est refusé, rien n'est créé.
            await using var tx = await c.BeginTransactionAsync();
            var id = await c.ExecuteScalarAsync<Guid>("""
                INSERT INTO clients (data, search_text, created_by, updated_by)
                VALUES (@data::jsonb, @search, @me, @me) RETURNING id
                """, new { data = v.Data.ToJsonString(), search = FieldValidator.BuildSearchText(fields, v.Data), me = me.Id }, tx);

            ReferralEndpoints.AssignResult? referral = null;
            if (input.SponsorId is { } sponsorId)
            {
                referral = await ReferralEndpoints.AssignSponsorAsync(c, tx, await config.GetSettingsAsync(), id, sponsorId, me.Id, CouponService.Today(opt));
                if (referral.Error is not null) return referral.Error; // la transaction est annulée
            }
            await tx.CommitAsync();

            await audit.LogAsync(me, "client.created", "client", id.ToString(), "Nouveau client",
                $"**{FullName(v.Data)}** a été ajouté.", $"/clients/{id}");
            if (referral is not null) await ReferralEndpoints.LogAssignedAsync(audit, me, id, referral);
            return Results.Ok(new { id });
        }).RequirePerm(Permissions.ClientsCreate);

        g.MapPut("/{id:guid}", async (Guid id, ClientInput input, HttpContext http, NpgsqlDataSource db, ConfigService config, AuditService audit) =>
        {
            var me = http.Me();
            var fields = await config.GetFieldsAsync("client");
            await using var c = await db.OpenConnectionAsync();

            var prevJson = await c.ExecuteScalarAsync<string?>("SELECT data::text FROM clients WHERE id = @id AND deleted_at IS NULL", new { id });
            if (prevJson is null) return EndpointAuth.NotFound("Client introuvable.");
            var prev = FieldValidator.ParseObject(prevJson);

            var v = await FieldValidator.ValidateAsync(fields, input.Data, c, prev);
            if (v.Errors.Count > 0) return EndpointAuth.Bad(string.Join("\n", v.Errors));

            if (!input.Force)
            {
                var dups = await FindDuplicatesAsync(c, v.Data, id);
                if (dups.Count > 0) return EndpointAuth.Conflict("Un client similaire existe déjà.", dups);
            }

            await c.ExecuteAsync("""
                UPDATE clients SET data = @data::jsonb, search_text = @search, updated_by = @me, updated_at = now()
                WHERE id = @id
                """, new { id, data = v.Data.ToJsonString(), search = FieldValidator.BuildSearchText(fields, v.Data), me = me.Id });

            var changed = fields.Where(f => (prev[f.Key]?.ToJsonString() ?? "") != (v.Data[f.Key]?.ToJsonString() ?? ""))
                                .Select(f => f.Label).ToList();
            var detail = changed.Count == 0 ? "Aucune modification." : "Champs modifiés : " + string.Join(", ", changed);
            await audit.LogAsync(me, "client.updated", "client", id.ToString(), "Client modifié",
                $"**{FullName(v.Data)}** — {detail}", $"/clients/{id}");

            // Permis ajouté ? On recalcule les avertissements des ventes en cours de ce client.
            await SaleEndpoints.RefreshPermitWarningsAsync(c, id, v.Data);
            if (changed.Count > 0) http.RefreshTourBoard(); // le nom du client apparaît dans le tableau
            return Results.Ok(new { id });
        }).RequirePerm(Permissions.ClientsEdit);

        g.MapDelete("/{id:guid}", async (Guid id, HttpContext http, NpgsqlDataSource db, AuditService audit) =>
        {
            var me = http.Me();
            await using var c = await db.OpenConnectionAsync();
            var json = await c.ExecuteScalarAsync<string?>("SELECT data::text FROM clients WHERE id = @id AND deleted_at IS NULL", new { id });
            if (json is null) return EndpointAuth.NotFound("Client introuvable.");

            var active = await c.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM sales WHERE client_id = @id AND status IN ('TO_ORDER','TO_FETCH','RECEIVED')", new { id });
            if (active > 0) return EndpointAuth.Conflict($"Ce client a {active} vente(s) en cours : livre-les ou annule-les avant de le supprimer.");

            await c.ExecuteAsync("UPDATE clients SET deleted_at = now(), updated_by = @me WHERE id = @id", new { id, me = me.Id });
            await audit.LogAsync(me, "client.deleted", "client", id.ToString(), "Client supprimé",
                $"**{FullName(FieldValidator.ParseObject(json))}** a été supprimé.");
            return Results.Ok(new { ok = true });
        }).RequirePerm(Permissions.ClientsDelete);
    }

    private sealed class DupRow
    {
        public Guid Id { get; set; }
        public string DataJson { get; set; } = "{}";
    }

    /// <summary>
    /// Doublons : même prénom + nom (insensible à la casse). « strong » = même date de naissance aussi.
    /// </summary>
    public static async Task<List<object>> FindDuplicatesAsync(NpgsqlConnection c, JsonObject data, Guid? excludeId)
    {
        var prenom = FieldValidator.GetString(data, "prenom")?.Trim();
        var nom = FieldValidator.GetString(data, "nom")?.Trim();
        if (string.IsNullOrEmpty(prenom) || string.IsNullOrEmpty(nom)) return new();
        var dob = FieldValidator.GetString(data, "date_naissance");

        var rows = await c.QueryAsync<DupRow>("""
            SELECT id, data::text AS data_json FROM clients
            WHERE deleted_at IS NULL
              AND lower(trim(data->>'prenom')) = lower(@prenom)
              AND lower(trim(data->>'nom')) = lower(@nom)
              AND (@excludeId::uuid IS NULL OR id <> @excludeId::uuid)
            LIMIT 10
            """, new { prenom, nom, excludeId });

        return rows.Select(r =>
        {
            var d = FieldValidator.ParseObject(r.DataJson);
            var rDob = FieldValidator.GetString(d, "date_naissance");
            return (object)new
            {
                r.Id,
                name = FullName(d),
                dateNaissance = rDob,
                telephone = FieldValidator.GetString(d, "telephone"),
                strong = dob is not null && rDob == dob,
            };
        }).ToList();
    }
}
