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
}

public sealed class StatusSetting
{
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public string Color { get; set; } = "#888888";
}

public sealed class PortalSettings
{
    public string? LogChannelId { get; set; }
    public string? TourChannelId { get; set; }
    public string? TourPingRoleId { get; set; }
    public string? ImmediatePingRoleId { get; set; }
    public bool TourEnabled { get; set; } = true;
    public bool TourSkipEmpty { get; set; } = true;
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
    public string VehicleName { get; set; } = "";
    public Guid VehicleTypeId { get; set; }
    public string VehicleTypeLabel { get; set; } = "";
    public string CategoryLabel { get; set; } = "";
    public bool RequiresPlate { get; set; }
    public decimal Price { get; set; }
    public bool Immediate { get; set; }
    public bool FromStock { get; set; }
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
