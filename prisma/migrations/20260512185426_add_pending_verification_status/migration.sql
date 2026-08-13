-- Add subcontractor-reported install completion status.
--
-- PENDING_VERIFICATION means installation was marked complete by the
-- subcontractor but has not yet been verified. It is intentionally separate
-- from COMPLETE, which remains the verified install-complete status.
ALTER TYPE "ScopeStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';
