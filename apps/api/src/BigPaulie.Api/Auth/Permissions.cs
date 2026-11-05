namespace BigPaulie.Api.Auth;

/// <summary>Catalogue des permissions attribuables aux grades (matrice de la page Configuration).</summary>
public static class Permissions
{
    public const string ClientsView = "clients.view";
    public const string ClientsCreate = "clients.create";
    public const string ClientsEdit = "clients.edit";
    public const string ClientsDelete = "clients.delete";
    public const string SalesView = "sales.view";
    public const string SalesCreate = "sales.create";
    public const string SalesAdvance = "sales.advance";
    public const string SalesRevert = "sales.revert";
    public const string SalesEdit = "sales.edit";
    public const string SalesCancel = "sales.cancel";
    public const string CouponsCreate = "coupons.create";
    public const string CouponsCancel = "coupons.cancel";
    public const string ReferralsManage = "referrals.manage";
    public const string TourView = "tour.view";
    public const string StatsView = "stats.view";
    public const string LogsView = "logs.view";
    public const string ConfigManage = "config.manage";

    public sealed record PermissionInfo(string Key, string Label, string Group);

    public static readonly PermissionInfo[] Catalog =
    {
        new(ClientsView, "Voir les clients", "Clients"),
        new(ClientsCreate, "Créer un client", "Clients"),
        new(ClientsEdit, "Modifier un client", "Clients"),
        new(ClientsDelete, "Supprimer un client", "Clients"),
        new(SalesView, "Voir les ventes", "Ventes"),
        new(SalesCreate, "Créer une vente", "Ventes"),
        new(SalesAdvance, "Faire avancer les statuts", "Ventes"),
        new(SalesRevert, "Revenir à un statut précédent", "Ventes"),
        new(SalesEdit, "Modifier une vente", "Ventes"),
        new(SalesCancel, "Annuler / rétablir une vente", "Ventes"),
        new(CouponsCreate, "Attribuer un coupon de promotion", "Ventes"),
        new(CouponsCancel, "Annuler un coupon de promotion", "Ventes"),
        new(ReferralsManage, "Enregistrer un parrainage", "Clients"),
        new(TourView, "Voir la tournée", "Logistique"),
        new(StatsView, "Voir l'analyse des ventes", "Logistique"),
        new(LogsView, "Voir les logs", "Administration"),
        new(ConfigManage, "Configuration du portail", "Administration"),
    };

    public static readonly string[] All = Catalog.Select(p => p.Key).ToArray();

    public static bool IsKnown(string key) => All.Contains(key);
}
