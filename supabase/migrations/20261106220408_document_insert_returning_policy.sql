-- INSERT ... RETURNING must authorize the new row directly. A stable helper
-- that re-reads documents uses the statement snapshot and cannot see it yet.
alter policy documents_read on public.documents to authenticated using (
  (owner_id=(select auth.uid()) and public.is_account_active())
  or document_private.document_access(id)
);
notify pgrst, 'reload schema';
