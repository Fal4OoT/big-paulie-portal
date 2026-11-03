using System.Reflection;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Infrastructure;

/// <summary>
/// Applique au démarrage les scripts SQL embarqués (Migrations/NNN_nom.sql), dans l'ordre,
/// chacun dans une transaction. Les scripts déjà appliqués sont ignorés.
/// </summary>
public static class Migrator
{
    public static async Task RunAsync(NpgsqlDataSource db, ILogger logger, CancellationToken ct = default)
    {
        // La base peut mettre quelques secondes à démarrer avec Docker.
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await using var probe = await db.OpenConnectionAsync(ct);
                break;
            }
            catch (Exception ex) when (attempt < 30)
            {
                logger.LogWarning("Base de données indisponible ({Message}), nouvel essai dans 2 s…", ex.Message);
                await Task.Delay(2000, ct);
            }
        }

        await using var conn = await db.OpenConnectionAsync(ct);
        await conn.ExecuteAsync("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version    text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            );
            """);

        var applied = (await conn.QueryAsync<string>("SELECT version FROM schema_migrations")).ToHashSet();

        var asm = Assembly.GetExecutingAssembly();
        var scripts = asm.GetManifestResourceNames()
            .Where(n => n.EndsWith(".sql", StringComparison.OrdinalIgnoreCase) && n.Contains(".Migrations."))
            .Select(n => (Resource: n, Version: n[(n.IndexOf(".Migrations.", StringComparison.Ordinal) + 12)..^4]))
            .OrderBy(s => s.Version, StringComparer.Ordinal)
            .ToList();

        foreach (var (resource, version) in scripts)
        {
            if (applied.Contains(version)) continue;

            await using var stream = asm.GetManifestResourceStream(resource)!;
            using var reader = new StreamReader(stream);
            var sql = await reader.ReadToEndAsync(ct);

            await using var tx = await conn.BeginTransactionAsync(ct);
            await conn.ExecuteAsync(sql, transaction: tx);
            await conn.ExecuteAsync("INSERT INTO schema_migrations (version) VALUES (@version)", new { version }, tx);
            await tx.CommitAsync(ct);

            logger.LogInformation("Migration appliquée : {Version}", version);
        }
    }
}
