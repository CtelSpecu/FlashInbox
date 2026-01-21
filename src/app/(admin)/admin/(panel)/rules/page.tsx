'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';

import { adminApiFetch, AdminApiError } from '@/lib/admin/api';
import { clearAdminSession } from '@/lib/admin/session-store';
import { withAdminTracking } from '@/lib/admin/tracking';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/Card';
import { Button } from '@/components/admin/ui/Button';
import { Input } from '@/components/admin/ui/Input';
import { Select } from '@/components/admin/ui/Select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/admin/ui/Table';
import { Modal } from '@/components/admin/ui/Modal';
import { useAdminI18n } from '@/lib/admin-i18n/context';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

type RuleType = 'sender_domain' | 'sender_addr' | 'keyword' | 'ip';
type RuleAction = 'drop' | 'quarantine' | 'allow';

interface RuleDto {
  id: number;
  type: RuleType;
  pattern: string;
  action: RuleAction;
  priority: number;
  isActive: boolean;
  description: string | null;
  domainId: number | null;
  domainName: string | null;
  hitCount: number;
  createdAt: number;
}

interface RulesList {
  rules: RuleDto[];
}

interface DomainDto {
  id: number;
  name: string;
}

export default function AdminRulesPage() {
  const { t } = useAdminI18n();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleDto[]>([]);
  const [domains, setDomains] = useState<DomainDto[]>([]);

  const [newType, setNewType] = useState<RuleType>('sender_domain');
  const [newPattern, setNewPattern] = useState('');
  const [newAction, setNewAction] = useState<RuleAction>('quarantine');
  const [newPriority, setNewPriority] = useState(100);
  const [newDesc, setNewDesc] = useState('');
  const [newDomainId, setNewDomainId] = useState<string>(''); // '' => global

  const [editId, setEditId] = useState<number | null>(null);
  const editRule = useMemo(() => rules.find((r) => r.id === editId) || null, [rules, editId]);
  const [editDraft, setEditDraft] = useState<Partial<RuleDto>>({});

  async function load() {
    setLoading(true);
    setErrorText(null);
    try {
      const [rRes, dRes] = await Promise.all([
        adminApiFetch<SuccessResponse<RulesList>>('/api/admin/rules'),
        adminApiFetch<SuccessResponse<{ domains: Array<{ id: number; name: string }> }>>('/api/admin/domains'),
      ]);
      setRules(rRes.data.rules);
      setDomains(dRes.data.domains.map((d) => ({ id: d.id, name: d.name })));
    } catch (e) {
      const err = e as AdminApiError;
      if (err.status === 401) {
        clearAdminSession();
        window.location.href = withAdminTracking('/admin/login');
        return;
      }
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addRule() {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await adminApiFetch<SuccessResponse<{ rule: RuleDto }>>('/api/admin/rules', {
        method: 'POST',
        body: JSON.stringify({
          type: newType,
          pattern: newPattern.trim(),
          action: newAction,
          priority: Number.isFinite(newPriority) ? newPriority : 100,
          description: newDesc.trim() || undefined,
          domainId: newDomainId ? Number(newDomainId) : undefined,
        }),
      });
      setRules((prev) => [res.data.rule, ...prev]);
      setNewPattern('');
      setNewDesc('');
      setNewPriority(100);
      setNewDomainId('');
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function patchRule(ruleId: number, patch: any) {
    setLoading(true);
    setErrorText(null);
    try {
      const res = await adminApiFetch<SuccessResponse<{ rule: RuleDto }>>(`/api/admin/rules/${ruleId}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setRules((prev) => prev.map((r) => (r.id === ruleId ? res.data.rule : r)));
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRule(ruleId: number) {
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ success: true }>>(`/api/admin/rules/${ruleId}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      setEditId(null);
    } catch (e) {
      const err = e as AdminApiError;
      setErrorText(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openEdit(rule: RuleDto) {
    setEditId(rule.id);
    setEditDraft({
      type: rule.type,
      pattern: rule.pattern,
      action: rule.action,
      priority: rule.priority,
      isActive: rule.isActive,
      description: rule.description,
      domainId: rule.domainId,
    });
  }

  async function saveEdit() {
    if (!editId) return;
    await patchRule(editId, {
      type: editDraft.type,
      pattern: (editDraft.pattern || '').trim(),
      action: editDraft.action,
      priority: editDraft.priority,
      isActive: editDraft.isActive,
      description: (editDraft.description || '').trim() || undefined,
      domainId: editDraft.domainId === null || editDraft.domainId === undefined ? null : editDraft.domainId,
    });
  }

  return (
    <div className="space-y-4">
      {errorText ? <div className="text-sm text-red-700">{errorText}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.rules.addRule}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-6">
          <Select value={newType} onChange={(e) => setNewType(e.target.value as RuleType)} disabled={loading}>
            <option value="sender_domain">sender_domain</option>
            <option value="sender_addr">sender_addr</option>
            <option value="keyword">keyword</option>
            <option value="ip">ip</option>
          </Select>
          <Input
            placeholder="pattern"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            disabled={loading}
          />
          <Select value={newAction} onChange={(e) => setNewAction(e.target.value as RuleAction)} disabled={loading}>
            <option value="drop">drop</option>
            <option value="quarantine">quarantine</option>
            <option value="allow">allow</option>
          </Select>
          <Input
            type="number"
            placeholder="priority"
            value={String(newPriority)}
            onChange={(e) => setNewPriority(parseInt(e.target.value || '100', 10))}
            disabled={loading}
          />
          <Select value={newDomainId} onChange={(e) => setNewDomainId(e.target.value)} disabled={loading}>
            <option value="">(global)</option>
            {domains.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </Select>
          <Button onClick={addRule} disabled={loading || !newPattern.trim()}>
            <Icon icon="lucide:plus" className="h-4 w-4" />
            {t.common.add}
          </Button>
          <div className="md:col-span-6">
            <Input
              placeholder={t.rules.description}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t.rules.rules}</CardTitle>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
              {t.common.reload}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>{t.domains.id}</TH>
                <TH>{t.rules.type}</TH>
                <TH>{t.rules.pattern}</TH>
                <TH>{t.rules.action}</TH>
                <TH>{t.rules.priority}</TH>
                <TH>{t.rules.active}</TH>
                <TH>{t.rules.domain}</TH>
                <TH>{t.rules.hits}</TH>
                <TH>{t.domains.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD className="text-[color:var(--admin-muted)]">{r.id}</TD>
                  <TD>{r.type}</TD>
                  <TD className="max-w-[320px] truncate" title={r.pattern}>
                    {r.pattern}
                  </TD>
                  <TD>{r.action}</TD>
                  <TD>{r.priority}</TD>
                  <TD>
                    <Button
                      variant={r.isActive ? 'secondary' : 'outline'}
                      size="sm"
                      disabled={loading}
                      onClick={() => patchRule(r.id, { isActive: !r.isActive })}
                    >
                      {r.isActive ? t.rules.on : t.rules.off}
                    </Button>
                  </TD>
                  <TD className="text-[color:var(--admin-muted)]">{r.domainName || t.rules.global}</TD>
                  <TD className="text-[color:var(--admin-muted)]">{r.hitCount}</TD>
                  <TD className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(r)} disabled={loading}>
                      <Icon icon="lucide:pencil" className="h-4 w-4" />
                      {t.common.edit}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteRule(r.id)} disabled={loading}>
                      <Icon icon="lucide:trash-2" className="h-4 w-4" />
                      {t.common.delete}
                    </Button>
                  </TD>
                </TR>
              ))}
              {rules.length === 0 && !loading ? (
                <TR>
                  <TD colSpan={9} className="py-6 text-center text-[color:var(--admin-muted)]">
                    {t.rules.noRules}
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Modal
        open={!!editId}
        onOpenChange={(o) => {
          if (!o) setEditId(null);
        }}
        title={t.rules.editRule}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditId(null)} disabled={loading}>
              {t.common.cancel}
            </Button>
            <Button onClick={saveEdit} disabled={loading || !String(editDraft.pattern || '').trim()}>
              {t.common.save}
            </Button>
          </div>
        }
      >
        {editRule ? (
          <div className="grid gap-2">
            <Select
              value={String(editDraft.type || editRule.type)}
              onChange={(e) => setEditDraft((p) => ({ ...p, type: e.target.value as RuleType }))}
              disabled={loading}
            >
              <option value="sender_domain">sender_domain</option>
              <option value="sender_addr">sender_addr</option>
              <option value="keyword">keyword</option>
              <option value="ip">ip</option>
            </Select>
            <Input
              value={String(editDraft.pattern ?? '')}
              onChange={(e) => setEditDraft((p) => ({ ...p, pattern: e.target.value }))}
              disabled={loading}
              placeholder="pattern"
            />
            <Select
              value={String(editDraft.action || editRule.action)}
              onChange={(e) => setEditDraft((p) => ({ ...p, action: e.target.value as RuleAction }))}
              disabled={loading}
            >
              <option value="drop">drop</option>
              <option value="quarantine">quarantine</option>
              <option value="allow">allow</option>
            </Select>
            <Input
              type="number"
              value={String(editDraft.priority ?? editRule.priority)}
              onChange={(e) => setEditDraft((p) => ({ ...p, priority: parseInt(e.target.value || '100', 10) }))}
              disabled={loading}
              placeholder="priority"
            />
            <Select
              value={editDraft.domainId === null || editDraft.domainId === undefined ? '' : String(editDraft.domainId)}
              onChange={(e) =>
                setEditDraft((p) => ({ ...p, domainId: e.target.value ? Number(e.target.value) : null }))
              }
              disabled={loading}
            >
              <option value="">(global)</option>
              {domains.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Input
              value={String(editDraft.description ?? '')}
              onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))}
              disabled={loading}
              placeholder={t.rules.description}
            />
            <div className="flex items-center justify-between rounded-md border border-[color:var(--admin-border)] p-2">
              <div className="text-sm text-[color:var(--admin-text)]">{t.rules.active}</div>
              <Button
                variant={editDraft.isActive ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setEditDraft((p) => ({ ...p, isActive: !p.isActive }))}
                disabled={loading}
              >
                {editDraft.isActive ? t.rules.on : t.rules.off}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}


