-- Expand inspection_types lookup for all form-builder categories (idempotent).

INSERT INTO "inspection_types" ("id", "code", "name")
VALUES
  ('insp_type_two_area_clear', 'TWO_AREA_CLEAR', '2 Area Clear'),
  ('insp_type_field_verification', 'FIELD_VERIFICATION', 'Field Verification'),
  ('insp_type_gypcrete', 'GYPCRETE_MOISTURE_TEST', 'Gypcrete Moisture Test'),
  ('insp_type_other', 'OTHER', 'Other')
ON CONFLICT ("code") DO NOTHING;
