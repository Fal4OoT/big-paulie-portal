namespace BigPaulie.Api.Auth;

public static class EndpointAuth
{
    /// <summary>
    /// Exige un utilisateur connecté et, si précisé, une permission.
    /// 401 si non connecté, 403 si la permission manque.
    /// </summary>
    public static TBuilder RequirePerm<TBuilder>(this TBuilder builder, string? permission = null)
        where TBuilder : IEndpointConventionBuilder
    {
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var svc = ctx.HttpContext.RequestServices.GetRequiredService<CurrentUserService>();
            var user = await svc.GetAsync(ctx.HttpContext);
            if (user is null) return Results.Json(new { error = "Non connecté." }, statusCode: 401);
            if (permission is not null && !user.Has(permission))
                return Results.Json(new { error = "Ton grade ne permet pas cette action." }, statusCode: 403);
            return await next(ctx);
        });
        return builder;
    }

    /// <summary>Utilisateur déjà résolu par <see cref="RequirePerm{TBuilder}"/>.</summary>
    public static CurrentUser Me(this HttpContext http) =>
        http.Items[CurrentUserService.ItemKey] as CurrentUser
        ?? throw new InvalidOperationException("RequirePerm manquant sur cet endpoint.");

    /// <summary>Demande la mise à jour du tableau de tournée Discord (sans notification).</summary>
    public static void RefreshTourBoard(this HttpContext http) =>
        http.RequestServices.GetRequiredService<BigPaulie.Api.Services.TourBoardService>().RequestRefresh();

    public static IResult Forbidden(string message = "Ton grade ne permet pas cette action.") =>
        Results.Json(new { error = message }, statusCode: 403);

    public static IResult Bad(string message) => Results.Json(new { error = message }, statusCode: 400);

    public static IResult Conflict(string message, object? extra = null) =>
        Results.Json(new { error = message, details = extra }, statusCode: 409);

    public static IResult NotFound(string message = "Introuvable.") => Results.Json(new { error = message }, statusCode: 404);
}
