'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';

import { cn } from '@/lib/utils/cn';
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

type RulePatch = Partial<Pick<RuleDto, 'type' | 'pattern' | 'action' | 'priority' | 'isActive' | 'description' | 'domainId'>>;

export default function AdminRulesPage() {
  const { t, format } = useAdminI18n();
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleDto[]>([]);
  const [domains, setDomains] = useState<DomainDto[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<{ action: 'activate' | 'deactivate' | 'delete' } | null>(null);

  const [newType, setNewType] = useState<RuleType>('sender_domain');
  const [newPattern, setNewPattern] = useState('');
  const [newAction, setNewAction] = useState<RuleAction>('quarantine');
  const [newPriority, setNewPriority] = useState(100);
  const [newDesc, setNewDesc] = useState('');
  const [newDomainId, setNewDomainId] = useState<string>(''); // '' => global

  const [editId, setEditId] = useState<number | null>(null);
  const editRule = useMemo(() => rules.find((r) => r.id === editId) || null, [rules, editId]);
  const [editDraft, setEditDraft] = useState<Partial<RuleDto>>({});

  function getRuleTypeLabel(type: RuleType): string {
    switch (type) {
      case 'sender_domain':
        return t.rules.typeSenderDomain;
      case 'sender_addr':
        return t.rules.typeSenderAddress;
      case 'keyword':
        return t.rules.typeKeyword;
      case 'ip':
        return t.rules.typeIp;
      default:
        return type;
    }
  }

  function getRuleActionLabel(action: RuleAction): string {
    switch (action) {
      case 'drop':
        return t.rules.actionDrop;
      case 'quarantine':
        return t.rules.actionQuarantine;
      case 'allow':
        return t.rules.actionAllow;
      default:
        return action;
    }
  }

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
      setSelected(new Set());
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

  async function patchRule(ruleId: number, patch: RulePatch) {
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

  const selectedCount = selected.size;
  const allSelected = rules.length > 0 && rules.every((r) => selected.has(r.id));

  function toggleSelected(id: number, next?: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      const shouldSelect = next ?? !copy.has(id);
      if (shouldSelect) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function setAll(next: boolean) {
    setSelected(next ? new Set(rules.map((r) => r.id)) : new Set());
  }

  async function applyBulk(action: 'activate' | 'deactivate' | 'delete') {
    if (selected.size === 0) return;
    setLoading(true);
    setErrorText(null);
    try {
      await adminApiFetch<SuccessResponse<{ ids: number[]; action: string }>>('/api/admin/rules/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      setBulkConfirm(null);
      await load();
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight text-[color:var(--heroui-foreground)]">{t.rules.rules}</h1>
        <p className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.rules.addRule}</p>
      </div>

      {errorText ? (
        <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-800 border border-red-100 flex items-center gap-3 font-bold shadow-sm">
           <Icon icon="lucide:alert-circle" className="h-5 w-5" />
           {errorText}
        </div>
      ) : null}

      <Card className="border-none shadow-[color:var(--heroui-shadow-medium)] bg-[color:var(--heroui-content1)]">
        <CardContent className="grid gap-4 md:grid-cols-6 pt-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.rules.type}</label>
            <Select
              value={newType}
              onChange={(val) => setNewType(val as RuleType)}
              disabled={loading}
              options={[
                { label: t.rules.typeSenderDomain, value: 'sender_domain' },
                { label: t.rules.typeSenderAddress, value: 'sender_addr' },
                { label: t.rules.typeKeyword, value: 'keyword' },
                { label: t.rules.typeIp, value: 'ip' },
              ]}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.rules.pattern}</label>
            <Input
              placeholder={t.rules.patternPlaceholder}
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              disabled={loading}
              className="h-12 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.rules.action}</label>
            <Select
              value={newAction}
              onChange={(val) => setNewAction(val as RuleAction)}
              disabled={loading}
              options={[
                { label: t.rules.actionDrop, value: 'drop' },
                { label: t.rules.actionQuarantine, value: 'quarantine' },
                { label: t.rules.actionAllow, value: 'allow' },
              ]}
            />
          </div>
          <div className="space-y-2">
             <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.rules.domain}</label>
             <Select
               value={newDomainId}
               onChange={setNewDomainId}
               disabled={loading}
               options={[
                 { label: t.rules.domainPlaceholder, value: '' },
                 ...domains.map(d => ({ label: d.name, value: String(d.id) }))
               ]}
             />
          </div>
          <div className="flex items-end pb-0.5">
            <Button onClick={addRule} disabled={loading || !newPattern.trim()} className="w-full h-12 rounded-xl font-bold shadow-lg shadow-[color:var(--heroui-primary-500)]/20">
              <Icon icon="lucide:plus" className="h-5 w-5" />
              {t.common.add}
            </Button>
          </div>
          <div className="md:col-span-5 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.rules.description}</label>
            <Input
              placeholder={t.rules.descriptionPlaceholder}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              disabled={loading}
              className="h-12 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-400)] ml-1">{t.rules.priority}</label>
            <Input
              type="number"
              placeholder="100"
              value={String(newPriority)}
              onChange={(e) => setNewPriority(parseInt(e.target.value || '100', 10))}
              disabled={loading}
              className="h-12 rounded-xl"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-[color:var(--heroui-shadow-large)]">
        <CardHeader className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <Icon icon="lucide:filter" className="h-6 w-6" />
               </div>
               <CardTitle className="text-xl font-black">{t.rules.rules}</CardTitle>
            </div>
            <div className="flex items-center gap-3">
              {selectedCount > 0 ? (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-xs font-black uppercase tracking-widest text-[color:var(--heroui-primary-500)] bg-[color:var(--heroui-primary-500)]/10 px-3 py-1.5 rounded-full">
                    {format(t.common.selectedCount, { count: selectedCount })}
                  </div>
                  <Select
                    value=""
                    className="min-w-[160px]"
                    onChange={(val) => {
                      if (!val) return;
                      setBulkConfirm({ action: val as any });
                    }}
                    disabled={loading}
                    options={[
                      { label: t.common.bulkActions, value: '' },
                      { label: t.rules.on, value: 'activate' },
                      { label: t.rules.off, value: 'deactivate' },
                      { label: t.common.delete, value: 'delete' },
                    ]}
                  />
                </div>
              ) : null}
              <Button variant="secondary" size="sm" onClick={load} disabled={loading} className="h-10 w-10 rounded-xl p-0">
                <Icon icon="lucide:refresh-cw" className={cn("h-5 w-5", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="border-none shadow-none rounded-none">
            <THead>
              <TR>
                <TH className="w-14">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      aria-label={t.common.bulkActions}
                      onChange={(e) => setAll(e.target.checked)}
                      disabled={loading || rules.length === 0}
                      className="h-5 w-5 rounded-lg border-2 border-[color:var(--heroui-divider)] bg-[color:var(--heroui-background)] checked:bg-[color:var(--heroui-primary-500)] transition-all cursor-pointer"
                    />
                  </div>
                </TH>
                <TH>{t.rules.type}</TH>
                <TH>{t.rules.pattern}</TH>
                <TH>{t.rules.action}</TH>
                <TH>{t.rules.priority}</TH>
                <TH>{t.rules.active}</TH>
                <TH>{t.rules.domain}</TH>
                <TH>{t.rules.hits}</TH>
                <TH className="text-right">{t.domains.actions}</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        aria-label={String(r.id)}
                        onChange={(e) => toggleSelected(r.id, e.target.checked)}
                        disabled={loading}
                        className="h-5 w-5 rounded-lg border-2 border-[color:var(--heroui-divider)] bg-[color:var(--heroui-background)] checked:bg-[color:var(--heroui-primary-500)] transition-all cursor-pointer"
                      />
                    </div>
                  </TD>
                  <TD>
                     <span className="px-2 py-0.5 rounded-lg bg-[color:var(--heroui-default-100)] text-[10px] font-black uppercase tracking-widest text-[color:var(--heroui-default-600)]">
                        {getRuleTypeLabel(r.type)}
                     </span>
                  </TD>
                  <TD className="max-w-[280px] font-black text-sm truncate" title={r.pattern}>
                    {r.pattern}
                  </TD>
                  <TD>
                     <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                        r.action === 'allow' ? "bg-green-500/10 text-green-600" :
                        r.action === 'quarantine' ? "bg-orange-500/10 text-orange-600" :
                        "bg-red-500/10 text-red-600"
                     )}>
                        {getRuleActionLabel(r.action)}
                     </span>
                  </TD>
                  <TD className="font-bold text-[color:var(--heroui-default-400)]">{r.priority}</TD>
                  <TD>
                    <button
                      disabled={loading}
                      onClick={() => patchRule(r.id, { isActive: !r.isActive })}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[color:var(--heroui-focus)] focus:ring-offset-2",
                        r.isActive ? "bg-[color:var(--heroui-primary-500)]" : "bg-[color:var(--heroui-default-200)]"
                      )}
                    >
                       <span className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          r.isActive ? "translate-x-5" : "translate-x-0"
                       )} />
                    </button>
                  </TD>
                  <TD className="text-xs font-bold text-[color:var(--heroui-default-400)] uppercase tracking-tight">{r.domainName || t.rules.global}</TD>
                  <TD>
                     <span className="px-3 py-1 rounded-full bg-[color:var(--heroui-default-100)] font-black text-xs">
                        {r.hitCount}
                     </span>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(r)} disabled={loading} className="h-9 w-9 rounded-lg p-0 bg-[color:var(--heroui-default-100)]">
                        <Icon icon="lucide:pencil" className="h-4 w-4" />
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteRule(r.id)} disabled={loading} className="h-9 w-9 rounded-lg p-0">
                        <Icon icon="lucide:trash-2" className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
              {rules.length === 0 && !loading ? (
                <TR>
                  <TD colSpan={10} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <Icon icon="lucide:ghost" className="h-12 w-12 text-[color:var(--heroui-default-200)]" />
                       <span className="text-sm font-bold text-[color:var(--heroui-default-400)] uppercase tracking-widest">{t.rules.noRules}</span>
                    </div>
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>
...

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
              onChange={(val) => setEditDraft((p) => ({ ...p, type: val as RuleType }))}
              disabled={loading}
              options={[
                { label: t.rules.typeSenderDomain, value: 'sender_domain' },
                { label: t.rules.typeSenderAddress, value: 'sender_addr' },
                { label: t.rules.typeKeyword, value: 'keyword' },
                { label: t.rules.typeIp, value: 'ip' },
              ]}
            />
            <Input
              value={String(editDraft.pattern ?? '')}
              onChange={(e) => setEditDraft((p) => ({ ...p, pattern: e.target.value }))}
              disabled={loading}
              placeholder={t.rules.patternPlaceholder}
            />
            <Select
              value={String(editDraft.action || editRule.action)}
              onChange={(val) => setEditDraft((p) => ({ ...p, action: val as RuleAction }))}
              disabled={loading}
              options={[
                { label: t.rules.actionDrop, value: 'drop' },
                { label: t.rules.actionQuarantine, value: 'quarantine' },
                { label: t.rules.actionAllow, value: 'allow' },
              ]}
            />
            <Input
              type="number"
              value={String(editDraft.priority ?? editRule.priority)}
              onChange={(e) => setEditDraft((p) => ({ ...p, priority: parseInt(e.target.value || '100', 10) }))}
              disabled={loading}
              placeholder={t.rules.priorityPlaceholder}
            />
            <Select
              value={editDraft.domainId === null || editDraft.domainId === undefined ? '' : String(editDraft.domainId)}
              onChange={(val) =>
                setEditDraft((p) => ({ ...p, domainId: val ? Number(val) : null }))
              }
              disabled={loading}
              options={[
                { label: t.rules.domainPlaceholder, value: '' },
                ...domains.map(d => ({ label: d.name, value: String(d.id) }))
              ]}
            />
            <Input
              value={String(editDraft.description ?? '')}
              onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))}
              disabled={loading}
              placeholder={t.rules.descriptionPlaceholder}
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

      <Modal
        open={!!bulkConfirm}
        onOpenChange={(o) => setBulkConfirm(o ? bulkConfirm : null)}
        title={t.common.confirm}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkConfirm(null)} disabled={loading}>
              {t.common.cancel}
            </Button>
            <Button
              variant={bulkConfirm?.action === 'delete' ? 'destructive' : 'default'}
              onClick={() => {
                if (!bulkConfirm) return;
                void applyBulk(bulkConfirm.action);
              }}
              disabled={loading}
            >
              {t.common.apply}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-[color:var(--admin-text)]">
          <div>{format(t.common.selectedCount, { count: selectedCount })}</div>
        </div>
      </Modal>
    </div>
  );
}
