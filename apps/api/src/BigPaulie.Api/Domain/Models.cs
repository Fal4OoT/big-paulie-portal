namespace BigPaulie.Api.Domain;

// Les classes ci-dessous sont mappées par Dapper (colonnes snake_case -> PascalCase,
// voir DefaultTypeMap.MatchNamesWithUnderscores dans Program.cs).

public sealed class UserRow
{
    public Guid Id { get; set; }
    public string DiscordId { get; set; } = "";
    public string Username { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? Avatar { get; set; }
    public string[] RoleIds { get; set; } = Array.Empty<string>();
    public DateTime RolesSyncedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime LastLoginAt { get; set; }
}

public sealed class GradeRow
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? DiscordRoleId { get; set; }
    public int Priority { get; set; }
    public bool IsStaff { get; set; }
    /// <summary>Grade des employés d'un partenaire (accès limité à l'espace partenaire).</summary>
    public Guid? PartnerId { get; set; }
    public string[] Permissions { get; set; } = Array.Empty<string>();
}

public sealed class FieldDefinition
{
    public Guid Id { get; set; }
    public string Entity { get; set; } = "client";
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string Type { get; set; } = "text";
    public bool Required { get; set; }
    public int SortOrder { get; set; }
    public bool IsSystem { get; set; }
    public string[] Options { get; set; } = Array.Empty<string>();
    public string? Help { get; set; }
}

public sealed class VehicleCategory
{
    public Guid Id { get; set; }
    public string Label { get; set; } = "";
    public int SortOrder { get; set; }
    public bool Active { get; set; } = true;
    /// <summary>Plaque obligatoire à la livraison (terrestre). Sans plaque pour le maritime et l'aérien.</summary>
    public bool RequiresPlate { get; set; } = true;
}

public sealed class VehicleType
{
    public Guid Id { get; set; }
    public string Label { get; set; } = "";
    public Guid CategoryId { get; set; }
    public string? PermitFieldKey { get; set; }
    public int SortOrder { get; set; }
    public bool Active { get; set; } = true;
    /// <summary>Plaque à la livraison pour ce type (null = comme la catégorie).</summary>
    public bool? RequiresPlate { get; set; }
}

public sealed class StatusSetting
{
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public string Color { get; set; } = "#888888";
}

public sealed class GiftTier
{
    public string Label { get; set; } = "";
    /// <summary>Prix de vente minimum (inclus).</summary>
    public decimal Min { get; set; }
    /// <summary>Prix de vente maximum (inclus), null = sans limite.</summary>
    public decimal? Max { get; set; }
    /// <summary>Choix à faire à la remise (ex : Blanc, Rouge). Vide = pas de choix.</summary>
    public List<string> Choices { get; set; } = new();
}

public sealed class PortalSettings
{
    public string? LogChannelId { get; set; }
    public string? TourChannelId { get; set; }
    public string? TourPingRoleId { get; set; }
    public string? ImmediatePingRoleId { get; set; }
    public bool TourEnabled { get; set; } = true;
    public bool TourSkipEmpty { get; set; } = true;
    /// <summary>Nombre de tournées d'attente au-delà duquel un véhicule est « en retard » (0 = désactivé).</summary>
    public int TourLateAfter { get; set; } = 3;
    /// <summary>Rôle mentionné à chaque tournée tant qu'il reste des véhicules en retard.</summary>
    public string? TourLateRoleId { get; set; }

    /// <summary>Pourcentage maximum d'un coupon de promotion (manuel ou fidélité).</summary>
    public int CouponMaxPercent { get; set; } = 20;
    public bool LoyaltyEnabled { get; set; }
    /// <summary>Un coupon de fidélité tous les N achats (ventes non annulées).</summary>
    public int LoyaltyEvery { get; set; } = 5;
    public int LoyaltyPercent { get; set; } = 10;
    /// <summary>Validité du coupon de fidélité en jours (null = sans expiration).</summary>
    public int? LoyaltyExpiryDays { get; set; } = 30;

    public bool ReferralEnabled { get; set; }
    /// <summary>Coupon du parrain, généré au premier achat du filleul.</summary>
    public int ReferralSponsorPercent { get; set; } = 10;
    /// <summary>Coupon du filleul, généré à l'enregistrement du parrainage.</summary>
    public int ReferralGodchildPercent { get; set; } = 10;
    /// <summary>Validité des coupons de parrainage en jours (null = sans expiration).</summary>
    public int? ReferralExpiryDays { get; set; } = 30;
    /// <summary>Nombre maximum de filleuls par parrain (null = illimité).</summary>
    public int? ReferralMaxGodchildren { get; set; } = 5;

    /// <summary>Cadeau à remettre à la livraison selon le prix de vente.</summary>
    public bool GiftsEnabled { get; set; }
    public List<GiftTier> GiftTiers { get; set; } = new();

    /// <summary>Palier de cadeau correspondant à un prix : celui au minimum le plus élevé atteint (un seul cadeau).</summary>
    public GiftTier? GiftFor(decimal price) =>
        !GiftsEnabled ? null
        : GiftTiers.Select((t, i) => (t, i))
                   .Where(x => price >= x.t.Min && (x.t.Max is null || price <= x.t.Max))
                   .OrderByDescending(x => x.t.Min).ThenByDescending(x => x.i)
                   .Select(x => x.t).FirstOrDefault();
    public List<StatusSetting> Statuses { get; set; } = new();

    public string StatusLabel(string code) =>
        Statuses.FirstOrDefault(s => s.Code == code)?.Label ?? code;
}

/// <summary>Statuts de vente. Les codes sont fixes (la logistique en dépend), les libellés sont configurables.</summary>
public static class SaleStatus
{
    public const string ToOrder = "TO_ORDER";
    public const string ToFetch = "TO_FETCH";
    public const string Received = "RECEIVED";
    public const string Delivered = "DELIVERED";
    public const string Cancelled = "CANCELLED";

    /// <summary>Ordre du circuit logistique (Annulé est hors circuit).</summary>
    public static readonly string[] Flow = { ToOrder, ToFetch, Received, Delivered };

    public static readonly string[] All = { ToOrder, ToFetch, Received, Delivered, Cancelled };

    public static int Rank(string code) => Array.IndexOf(Flow, code);

    public static bool IsValid(string? code) => code is not null && All.Contains(code);
}

/// <summary>Ligne de vente enrichie (jointures client / type / vendeur).</summary>
public sealed class SaleView
{
    public Guid Id { get; set; }
    public long Number { get; set; }
    public Guid ClientId { get; set; }
    public string ClientName { get; set; } = "";
    public string? ClientPhone { get; set; }
    public Guid? CatalogVehicleId { get; set; }
    public string VehicleName { get; set; } = "";
    public Guid VehicleTypeId { get; set; }
    public string VehicleTypeLabel { get; set; } = "";
    public Guid CategoryId { get; set; }
    public string CategoryLabel { get; set; } = "";
    public bool RequiresPlate { get; set; }
    public decimal Price { get; set; }
    public bool Immediate { get; set; }
    public bool FromStock { get; set; }
    public Guid? CouponId { get; set; }
    public long? CouponNumber { get; set; }
    public int? CouponPercent { get; set; }
    public string? CouponReason { get; set; }
    public string? Gift { get; set; }
    public string? Plate { get; set; }
    public string Status { get; set; } = "";
    public bool PermitWarning { get; set; }
    public string DataJson { get; set; } = "{}";
    public Guid SellerId { get; set; }
    public string SellerName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
}

public sealed class SaleEventView
{
    public Guid Id { get; set; }
    public string Action { get; set; } = "";
    public string? FromStatus { get; set; }
    public string? ToStatus { get; set; }
    public string? Note { get; set; }
    public Guid? ActorId { get; set; }
    public string? ActorName { get; set; }
    public DateTime At { get; set; }
}
