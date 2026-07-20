import "server-only";
import { MISA_DATA_TYPES, type MisaDataType, type MisaRecord } from "./client";

// ---------------------------------------------------------------------
// Dữ liệu MISA GIẢ dùng cho chế độ mock (khi chưa cấu hình credentials).
// Cấu trúc & tên field mô phỏng đúng response get_dictionary của MISA để
// khi cắm credentials thật, mapper trong sync.ts không phải đổi gì.
// Mã danh mục (code) TRÙNG với seed.ts để đồng bộ hòa vào cùng bản ghi.
// ---------------------------------------------------------------------

// data_type 1 — Đối tượng (nhà cung cấp). object_type: 1 = NCC.
const ACCOUNT_OBJECTS: MisaRecord[] = [
  {
    account_object_id: "misa-ao-bosch",
    account_object_code: "SUP-BOSCH",
    account_object_name: "Bosch Vietnam",
    company_tax_code: "0301122334",
    address: "Etown, Cộng Hòa, Tân Bình, TP.HCM",
    contact_name: "Mr. Klaus",
    tel: "028-1234-5678",
    email: "sales@bosch.vn",
    bank_account: "VCB-007-123456",
    object_type: 1,
    inactive: false,
  },
  {
    account_object_id: "misa-ao-lg",
    account_object_code: "SUP-LG",
    account_object_name: "LG Electronics VN",
    company_tax_code: "0305566778",
    address: "Hai Bà Trưng, Hà Nội",
    contact_name: "Ms. Ha",
    tel: "024-9999-1111",
    email: "sales@lg.vn",
    object_type: 1,
    inactive: false,
  },
  {
    account_object_id: "misa-ao-samsung",
    account_object_code: "SUP-SAMSUNG",
    account_object_name: "Samsung Vina",
    company_tax_code: "0309988776",
    address: "KCN Yên Phong, Bắc Ninh",
    contact_name: "Mr. Kim",
    tel: "0222-3333-444",
    email: "b2b@samsung.vn",
    object_type: 1,
    inactive: false,
  },
];

// data_type 2 — Vật tư / hàng hóa.
const INVENTORY_ITEMS: MisaRecord[] = [
  {
    inventory_item_id: "misa-it-cook",
    inventory_item_code: "BOSCH-COOK-01",
    inventory_item_name: "Bếp từ Bosch",
    unit_id: "misa-unit-pcs",
    unit_name: "PCS",
    category_name: "Appliance",
    purchase_account: "156-BOSCH-COOK-01",
    vat_rate: 10,
    inactive: false,
  },
  {
    inventory_item_id: "misa-it-dish",
    inventory_item_code: "BOSCH-DW-01",
    inventory_item_name: "Máy rửa chén Bosch",
    unit_id: "misa-unit-pcs",
    unit_name: "PCS",
    category_name: "Appliance",
    purchase_account: "156-BOSCH-DW-01",
    vat_rate: 10,
    inactive: false,
  },
  {
    inventory_item_id: "misa-it-lock",
    inventory_item_code: "BOSCH-LOCK-01",
    inventory_item_name: "Khóa Bosch",
    unit_id: "misa-unit-pcs",
    unit_name: "PCS",
    category_name: "Hardware",
    purchase_account: "156-BOSCH-LOCK-01",
    vat_rate: 10,
    inactive: false,
  },
  {
    inventory_item_id: "misa-it-cable",
    inventory_item_code: "LG-CABLE-01",
    inventory_item_name: "Dây cáp điện LG",
    unit_id: "misa-unit-m",
    unit_name: "Mét",
    category_name: "Hardware",
    purchase_account: "152-LG-CABLE-01",
    vat_rate: 8,
    inactive: false,
  },
];

// data_type 3 — Kho.
const STOCKS: MisaRecord[] = [
  { stock_id: "misa-stk-tt", stock_code: "KHO-TT", stock_name: "Kho Trung Tâm", branch_id: "misa-org-hcm", inactive: false },
  { stock_id: "misa-stk-hn", stock_code: "KHO-HN", stock_name: "Kho Hà Nội", branch_id: "misa-org-hn", inactive: false },
];

// data_type 4 — Đơn vị tính.
const UNITS: MisaRecord[] = [
  { unit_id: "misa-unit-pcs", unit_name: "PCS", inactive: false },
  { unit_id: "misa-unit-m", unit_name: "Mét", inactive: false },
  { unit_id: "misa-unit-kg", unit_name: "Kg", inactive: false },
  { unit_id: "misa-unit-set", unit_name: "Bộ", inactive: false },
];

// data_type 6 — Cơ cấu tổ chức (phòng ban / chi nhánh).
const ORG_UNITS: MisaRecord[] = [
  { organization_unit_id: "misa-org-ops", organization_unit_code: "OPS", organization_unit_name: "Vận hành", parent_id: null, inactive: false },
  { organization_unit_id: "misa-org-prj", organization_unit_code: "PRJ", organization_unit_name: "Dự án", parent_id: null, inactive: false },
  { organization_unit_id: "misa-org-proc", organization_unit_code: "PROC", organization_unit_name: "Mua hàng", parent_id: null, inactive: false },
  { organization_unit_id: "misa-org-fin", organization_unit_code: "FIN", organization_unit_name: "Tài chính", parent_id: null, inactive: false },
];

export function mockDictionary(dataType: MisaDataType): MisaRecord[] {
  switch (dataType) {
    case MISA_DATA_TYPES.ACCOUNT_OBJECT:
      return ACCOUNT_OBJECTS;
    case MISA_DATA_TYPES.INVENTORY_ITEM:
      return INVENTORY_ITEMS;
    case MISA_DATA_TYPES.STOCK:
      return STOCKS;
    case MISA_DATA_TYPES.UNIT:
      return UNITS;
    case MISA_DATA_TYPES.ORG_UNIT:
      return ORG_UNITS;
    default:
      return [];
  }
}
