// Types partagés avec l'API (JSON camelCase).

export type FieldType = "text" | "textarea" | "phone" | "date" | "number" | "checkbox" | "select" | "image";

export interface FieldDefinition {
  id: string;
  entity: "client" | "sale";
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  sortOrder: number;
  isSystem: boolean;
  options: string[];
  help: string | null;
}

export type FieldValue = string | number | boolean | null | undefined;
export type DataRecord = Record<string, FieldValue>;

export interface VehicleCategory {
  id: string;
  label: string;
  sortOrder: number;
  active: boolean;
  /** Plaque demandée à la livraison (terrestre). */
  requiresPlate: boolean;
}

export interface VehicleType {
  id: string;
  label: string;
  categoryId: string;
  permitFieldKey: string | null;
  sortOrder: number;
  active: boolean;
  /** Plaque à la livraison pour ce type (null = comme la catégorie). */
  requiresPlate: boolean | null;
}

export type CouponStatus = "AVAILABLE" | "USED" | "EXPIRED" | "CANCELLED";

export interface Coupon {
  id: string;
  reference: string;
  percent: number;
  reason: string;
  expiresOn: string | null;
  source: "MANUAL" | "LOYALTY" | "REFERRAL" | "BIRTHDAY";
  sourceSaleId: string | null;
  sourceSaleReference: string | null;
  createdByName: string | null;
  createdAt: string;
  usedSaleId: string | null;
  usedSaleReference: string | null;
  usedByName: string | null;
  usedAt: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  status: CouponStatus;
  events: { action: string; saleReference: string | null; note: string | null; actorName: string | null; at: string }[];
}

export interface ClientCoupons {
  coupons: Coupon[];
  loyalty: {
    enabled: boolean;
    every: number;
    percent: number;
    expiryDays: number | null;
    purchases: number;
    qualifying: number;
    minAmount: number;
    progress: number;
  };
  maxPercent: number;
}

export interface ClientReferral {
  enabled: boolean;
  sponsor: { id: string; name: string } | null;
  sponsorSetAt: string | null;
  sponsorSetByName: string | null;
  purchases: number;
  canSetSponsor: boolean;
  /** Changer ou retirer le parrain (avant le premier achat, ou à tout moment avec la permission dédiée). */
  canChangeSponsor: boolean;
  afterPurchase: boolean;
  lockReason: string | null;
  godchildren: { id: string; name: string; since: string | null; purchases: number; sponsorRewarded: boolean }[];
  maxGodchildren: number | null;
  sponsorPercent: number;
  godchildPercent: number;
}

export interface CatalogVehicle {
  id: string;
  name: string;
  segmentEmoji: string | null;
  segmentLabel: string | null;
  vehicleTypeId: string | null;
}

export interface CatalogSegment {
  emoji: string;
  label: string;
  vehicleTypeId: string | null;
  sortOrder: number;
  vehicleCount: number;
}

export interface CatalogAdmin {
  segments: CatalogSegment[];
  activeCount: number;
  inactiveCount: number;
  lastImportAt: string | null;
  withoutSegment: number;
  offCatalogSales: number;
}

export interface CatalogImportResult {
  company: string | null;
  total: number;
  added: string[];
  renamed: { from: string; to: string }[];
  movedSegment: number;
  reactivated: string[];
  removed: string[];
  unknownSegments: string[];
  applied: boolean;
  linkedSales: number;
}

export interface StatsGroup {
  label: string;
  detail: string | null;
  count: number;
  revenue: number;
}

export interface StatsData {
  from: string;
  to: string;
  totals: {
    count: number;
    revenue: number;
    averagePrice: number | null;
    delivered: number;
    pending: number;
    immediate: number;
    fromStock: number;
    offCatalog: number;
    cancelled: number;
    avgDeliveryHours: number | null;
  };
  vehicles: StatsGroup[];
  segments: StatsGroup[];
  types: StatsGroup[];
  sellers: StatsGroup[];
  days: { date: string; count: number; revenue: number; newClients: number }[];
  clients: {
    newClients: number;
    buyers: number;
    firstTimeBuyers: number;
    returningBuyers: number;
    repeatBuyers: number;
    newClientsConverted: number;
    totalClients: number;
  };
  /** detail = identifiant du client (lien vers sa fiche). */
  topClients: StatsGroup[];
}

export type StatusCode = "TO_ORDER" | "TO_FETCH" | "RECEIVED" | "DELIVERED" | "CANCELLED";

export const STATUS_FLOW: StatusCode[] = ["TO_ORDER", "TO_FETCH", "RECEIVED", "DELIVERED"];
export const ACTIVE_STATUSES: StatusCode[] = ["TO_ORDER", "TO_FETCH", "RECEIVED"];

export interface StatusSetting {
  code: StatusCode;
  label: string;
  color: string;
}

export interface PermissionInfo {
  key: string;
  label: string;
  group: string;
}

export interface PortalConfig {
  clientFields: FieldDefinition[];
  saleFields: FieldDefinition[];
  categories: VehicleCategory[];
  vehicleTypes: VehicleType[];
  statuses: StatusSetting[];
  permissions: PermissionInfo[];
  referralEnabled: boolean;
  giftsEnabled: boolean;
  giftTiers: GiftTier[];
  partners: PartnerPublic[];
}

export interface PartnerPublic {
  id: string;
  name: string;
  discountPercent: number;
  windowHours: number;
  categoryIds: string[];
  clientTerms: string;
}

export interface PartnerConfig extends PartnerPublic {
  active: boolean;
  contractTerms: string;
  channelId: string | null;
}

export interface PartnerEligible {
  saleId: string;
  number: number;
  vehicleName: string;
  vehicleTypeLabel: string;
  plate: string | null;
  clientName: string;
  deliveredAt: string;
  expiresAt: string;
  validationId: string | null;
  amount: number | null;
  note: string | null;
  validatedAt: string | null;
  validatedByName: string | null;
}

export interface PartnerValidation {
  id: string;
  partnerId: string;
  partnerName: string;
  saleId: string;
  number: number;
  vehicleName: string;
  plate: string | null;
  clientName: string;
  deliveredAt: string | null;
  amount: number | null;
  note: string | null;
  validatedAt: string;
  validatedByName: string | null;
}

export interface PartnerSpace {
  partner: { id: string; name: string; discountPercent: number; windowHours: number; contractTerms: string; clientTerms: string };
  eligible: PartnerEligible[];
  history: PartnerValidation[];
  employees: { name: string; grade: string | null; avatarUrl: string | null }[];
  canValidate: boolean;
}

export interface PartnersOverview {
  partners: (PartnerConfig & { stats: { count30: number; amount30: number; countAll: number; amountAll: number } })[];
  recent: PartnerValidation[];
}

export interface GiftTier {
  label: string;
  min: number;
  max: number | null;
  choices: string[];
}

export interface TrainingSummary {
  id: string;
  title: string;
  category: string | null;
  published: boolean;
  sortOrder: number;
  updatedByName: string | null;
  updatedAt: string;
  excerpt: string;
  searchText: string;
}

export interface TrainingSheet {
  id: string;
  title: string;
  category: string | null;
  content: string;
  published: boolean;
  sortOrder: number;
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string;
}

export interface Me {
  id: string;
  discordId: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  grades: { id: string; name: string; isStaff: boolean }[];
  permissions: string[];
  isAdmin: boolean;
}

export interface Client {
  id: string;
  name: string;
  data: DataRecord;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
  saleCount: number;
  activeSaleCount: number;
  internalNote: string | null;
  /** Note affichée en avertissement au moment d'une vente. */
  noteAlert: boolean;
  noteUpdatedAt: string | null;
  noteUpdatedByName: string | null;
}

export interface Duplicate {
  id: string;
  name: string;
  dateNaissance: string | null;
  telephone: string | null;
  strong: boolean;
}

export interface Sale {
  id: string;
  number: number;
  reference: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  catalogVehicleId: string | null;
  vehicleName: string;
  vehicleTypeId: string;
  vehicleTypeLabel: string;
  categoryId: string;
  categoryLabel: string;
  requiresPlate: boolean;
  price: number;
  immediate: boolean;
  /** Vendu depuis le stock : la vente a démarré en « Réceptionné ». */
  fromStock: boolean;
  couponId: string | null;
  couponReference: string | null;
  couponPercent: number | null;
  couponReason: string | null;
  gift: string | null;
  plate: string | null;
  status: StatusCode;
  permitWarning: boolean;
  data: DataRecord;
  sellerId: string;
  sellerName: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  /** Rendez-vous de livraison convenu (facultatif). */
  deliveryAt: string | null;
  /** Note interne du client marquée « alerte ». */
  clientAlert: string | null;
  lastContact: { outcome: ContactOutcome; at: string; note: string | null; byName: string | null } | null;
  contactCount: number;
}

export type ContactOutcome = "NO_ANSWER" | "MESSAGE" | "REACHED" | "APPOINTMENT";

export const CONTACT_LABELS: Record<ContactOutcome, string> = {
  NO_ANSWER: "Pas de réponse",
  MESSAGE: "Message laissé",
  REACHED: "Client joint",
  APPOINTMENT: "RDV pris",
};

export interface SaleContact {
  id: string;
  outcome: ContactOutcome;
  note: string | null;
  appointmentAt: string | null;
  actorName: string | null;
  at: string;
}

export interface GoalProgress {
  key: string;
  label: string;
  target: number;
  current: number;
}

export interface BirthdayInfo {
  id: string;
  name: string;
  phone: string | null;
  date: string;
  daysUntil: number;
  age: number | null;
  coupon: string | null;
}

export interface InactiveClient {
  id: string;
  name: string;
  phone: string | null;
  purchases: number;
  total: number;
  lastPurchaseAt: string;
}

export interface SalePartnerValidation {
  id: string;
  partnerName: string;
  amount: number | null;
  note: string | null;
  validatedAt: string;
  validatedByName: string | null;
}

export interface SaleEvent {
  id: string;
  action: "CREATED" | "STATUS" | "EDITED" | "CANCELLED" | "RESTORED";
  fromStatus: StatusCode | null;
  toStatus: StatusCode | null;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  at: string;
}

export interface Grade {
  id: string;
  name: string;
  discordRoleId: string | null;
  priority: number;
  isStaff: boolean;
  partnerId: string | null;
  permissions: string[];
}

export interface PortalSettings {
  logChannelId: string | null;
  tourChannelId: string | null;
  tourPingRoleId: string | null;
  immediatePingRoleId: string | null;
  tourEnabled: boolean;
  tourSkipEmpty: boolean;
  tourLateAfter: number;
  tourLateRoleId: string | null;
  couponMaxPercent: number;
  loyaltyEnabled: boolean;
  loyaltyEvery: number;
  loyaltyPercent: number;
  loyaltyExpiryDays: number | null;
  loyaltyMinAmount: number;
  referralEnabled: boolean;
  referralSponsorPercent: number;
  referralGodchildPercent: number;
  referralExpiryDays: number | null;
  referralMaxGodchildren: number | null;
  giftsEnabled: boolean;
  giftTiers: GiftTier[];
  statuses: StatusSetting[];
  recapEnabled: boolean;
  recapChannelId: string | null;
  recapPingRoleId: string | null;
  /** 1 = lundi … 7 = dimanche. */
  recapDay: number;
  recapHour: number;
  recapWeek: "previous" | "current";
  recapAmounts: boolean;
  recapCompare: boolean;
  recapVehicles: boolean;
  recapSellers: boolean;
  recapClients: boolean;
  recapGoals: boolean;
  goalSales: number | null;
  goalDelivered: number | null;
  goalNewClients: number | null;
  birthdayCouponEnabled: boolean;
  birthdayPercent: number;
  birthdayExpiryDays: number | null;
}

export interface AdminConfig {
  grades: Grade[];
  settings: PortalSettings;
  recapStatus: { lastSentAt: string | null; lastFrom: string | null; lastTo: string | null; nextAt: string | null };
  discordRoles: { id: string; name: string; color: string | null }[];
  discordChannels: { id: string; name: string }[];
  discordError: string | null;
}

export interface Member {
  id: string;
  discordId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  grades: string[];
  isAdmin: boolean;
  lastLoginAt: string;
}

export interface AuditEntry {
  id: number;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  at: string;
}

export interface TourData {
  nextSlotUtc: string;
  nextSlotLabel: string;
  toOrder: Sale[];
  toFetch: Sale[];
  received: Sale[];
}
