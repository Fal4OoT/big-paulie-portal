using System.Security.Cryptography;
using System.Text;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Infrastructure;
using BigPaulie.Api.Services;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Endpoints;

/// <summary>
/// Endpoints réservés au bot (clé partagée X-Internal-Key). Les droits sont ceux du membre Discord
/// qui lance la commande, calculés depuis ses rôles.
/// Caddy bloque /api/internal depuis l'extérieur : seul le réseau Docker y a accès.
/// </summary>
public static class InternalEndpoints
{
    private sealed class ClientLite
    {
        public Guid Id { get; set; }
        public string DataJson { get; set; } = "{}";
        public int ActiveSaleCount { get; set; }
    }

    public static void MapInternal(this WebApplication app)
    {
        var g = app.MapGroup("/api/internal").AddEndpointFilter(async (ctx, next) =>
        {
            var opt = ctx.HttpContext.RequestServices.GetRequiredService<PortalOptions>();
            var key = ctx.HttpContext.Request.Headers["X-Internal-Key"].ToString();
            if (string.IsNullOrEmpty(opt.InternalApiKey) || !CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(key), Encoding.UTF8.GetBytes(opt.InternalApiKey)))
                return Results.Json(new { error = "Clé interne invalide." }, statusCode: 401);
            return await next(ctx);
        });

        g.MapGet("/clients", async (string discordId, string? q, CurrentUserService users, NpgsqlDataSource db) =>
        {
            var (me, err) = await users.ForDiscordIdAsync(discordId);
            if (me is null) return EndpointAuth.Forbidden(err!);
            if (!me.Has(Permissions.ClientsView)) return EndpointAuth.Forbidden();

            var p = new DynamicParameters();
            var where = "WHERE c.deleted_at IS NULL" + ClientEndpoints.SearchClause("c.search_text", q, p);
            await using var c = await db.OpenConnectionAsync();
            var rows = await c.QueryAsync<ClientLite>($"""
                SELECT c.id, c.data::text AS data_json,
                       (SELECT count(*)::int FROM sales s WHERE s.client_id = c.id AND s.status IN ('TO_ORDER','TO_FETCH','RECEIVED')) AS active_sale_count
                FROM clients c {where} ORDER BY c.updated_at DESC LIMIT 10
                """, p);
            return Results.Ok(rows.Select(r =>
            {
                var d = FieldValidator.ParseObject(r.DataJson);
                return new
                {
                    r.Id,
                    name = ClientEndpoints.FullName(d),
                    telephone = FieldValidator.GetString(d, "telephone"),
                    dateNaissance = FieldValidator.GetString(d, "date_naissance"),
                    r.ActiveSaleCount,
                };
            }));
        });

        g.MapGet("/sales", async (string discordId, string? q, CurrentUserService users, NpgsqlDataSource db, ConfigService config) =>
        {
            var (me, err) = await users.ForDiscordIdAsync(discordId);
            if (me is null) return EndpointAuth.Forbidden(err!);
            if (!me.Has(Permissions.SalesView)) return EndpointAuth.Forbidden();

            var p = new DynamicParameters();
            var where = "WHERE c.deleted_at IS NULL" + ClientEndpoints.SearchClause(
                "lower(s.vehicle_name || ' ' || coalesce(s.plate,'') || ' bp-' || lpad(s.number::text, 4, '0') || ' ' || c.search_text)", q, p);
            await using var c = await db.OpenConnectionAsync();
            var rows = await c.QueryAsync<SaleView>($"{SaleEndpoints.SelectSale} {where} ORDER BY s.created_at DESC LIMIT 10", p);
            var settings = await config.GetSettingsAsync();
            return Results.Ok(rows.Select(s => new
            {
                s.Id,
                reference = SaleEndpoints.Ref(s.Number),
                s.VehicleName,
                s.VehicleTypeLabel,
                s.ClientName,
                s.Status,
                statusLabel = settings.StatusLabel(s.Status),
                s.Plate,
                s.Immediate,
                s.PermitWarning,
                s.SellerName,
                s.CreatedAt,
            }));
        });

        g.MapGet("/tour", async (string discordId, CurrentUserService users, TourService tour, ConfigService config) =>
        {
            var (me, err) = await users.ForDiscordIdAsync(discordId);
            if (me is null) return EndpointAuth.Forbidden(err!);
            if (!me.Has(Permissions.TourView)) return EndpointAuth.Forbidden();

            var pending = await tour.PendingAsync(SaleStatus.ToOrder, SaleStatus.ToFetch, SaleStatus.Received);
            var settings = await config.GetSettingsAsync();
            var next = tour.NextSlotUtc(DateTime.UtcNow);
            object Group(string code) => new
            {
                label = settings.StatusLabel(code),
                items = pending.Where(s => s.Status == code).Select(TourService.Line).ToArray(),
            };
            return Results.Ok(new
            {
                nextSlotLabel = tour.LocalHour(next),
                toOrder = Group(SaleStatus.ToOrder),
                toFetch = Group(SaleStatus.ToFetch),
                received = Group(SaleStatus.Received),
            });
        });
    }
}
