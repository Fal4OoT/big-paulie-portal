using System.Text.Json;
using BigPaulie.Api.Auth;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Endpoints;
using BigPaulie.Api.Infrastructure;
using BigPaulie.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Npgsql;

DefaultTypeMap.MatchNamesWithUnderscores = true;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://0.0.0.0:8080");

var options = PortalOptions.FromEnvironment(builder.Configuration);
builder.Services.AddSingleton(options);

var connectionString = builder.Configuration["DATABASE_URL"]
    ?? throw new InvalidOperationException("DATABASE_URL manquant (chaîne de connexion PostgreSQL).");
builder.Services.AddSingleton(new NpgsqlDataSourceBuilder(connectionString).Build());

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
});

// Clés de chiffrement des cookies persistées : un redémarrage ne déconnecte personne.
builder.Services.AddDataProtection()
    .SetApplicationName("BigPauliePortal")
    .PersistKeysToFileSystem(new DirectoryInfo(builder.Configuration["DATA_PROTECTION_PATH"] ?? "/keys"));

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "bp_session";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = options.IsHttps ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
        o.SlidingExpiration = true;
        o.ExpireTimeSpan = TimeSpan.FromDays(14);
        // API JSON : pas de redirections, des codes HTTP.
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();

builder.Services.AddHttpClient<DiscordRestClient>(c => c.Timeout = TimeSpan.FromSeconds(15));
builder.Services.AddSingleton<DiscordNotifier>();
builder.Services.AddSingleton<ConfigService>();
builder.Services.AddSingleton<TourService>();
builder.Services.AddSingleton<TourBoardService>();
builder.Services.AddSingleton<StatsService>();
builder.Services.AddSingleton<RecapService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TourBoardService>());
builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddHostedService<DiscordSenderService>();
builder.Services.AddHostedService<TourSchedulerService>();
builder.Services.AddHostedService<WeeklyRecapService>();

var app = builder.Build();

await Migrator.RunAsync(app.Services.GetRequiredService<NpgsqlDataSource>(), app.Logger);

if (string.IsNullOrEmpty(options.DiscordClientId) || string.IsNullOrEmpty(options.DiscordBotToken) || string.IsNullOrEmpty(options.DiscordGuildId))
    app.Logger.LogWarning("Configuration Discord incomplète : renseigne DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN et DISCORD_GUILD_ID.");
if (options.InternalApiKey.Length < 24)
    app.Logger.LogWarning("INTERNAL_API_KEY absente ou trop courte : le bot ne pourra pas interroger l'API.");

app.UseExceptionHandler(errorApp => errorApp.Run(async ctx =>
{
    ctx.Response.StatusCode = 500;
    await ctx.Response.WriteAsJsonAsync(new { error = "Erreur interne. Réessaie, et préviens un administrateur si ça continue." });
}));

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapAuth();
app.MapClients();
app.MapSales();
app.MapMisc();
app.MapConfig();
app.MapInternal();
app.MapCatalog();
app.MapStats();
app.MapCoupons();
app.MapReferrals();
app.MapTraining();
app.MapPartners();

app.Run();
