import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { crmApi } from "@/api/localApiClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import EmptyState from "../components/EmptyState";
import { Plus, Users, Building2, Search } from "lucide-react";

const TYPE_COLORS = { client:"blue", builder:"amber", designer:"purple", architect:"cyan", supplier:"teal", subcontractor:"orange" };
const TYPES = ["client","builder","designer","architect","supplier","subcontractor"];

export default function Contacts() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState("contact");
  const [form, setForm] = useState({ type: "client" });

  useEffect(() => {
    Promise.all([
      crmApi.entities.Contact.list("-created_date", 300),
      crmApi.entities.Company.list("-created_date", 300),
    ]).then(([c, co]) => { setContacts(c); setCompanies(co); }).finally(() => setLoading(false));
  }, []);

  const reload = () => Promise.all([
    crmApi.entities.Contact.list("-created_date", 300),
    crmApi.entities.Company.list("-created_date", 300),
  ]).then(([c, co]) => { setContacts(c); setCompanies(co); });

  const handleCreate = async () => {
    if (createType === "contact") await crmApi.entities.Contact.create(form);
    else await crmApi.entities.Company.create(form);
    setShowCreate(false); setForm({ type: "client" }); reload();
  };

  const fc = contacts.filter(c => `${c.first_name} ${c.last_name} ${c.email} ${c.company_name}`.toLowerCase().includes(search.toLowerCase()));
  const fco = companies.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <PageHeader title="Contacts" subtitle={`${contacts.length} contacts · ${companies.length} companies`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setCreateType("company"); setForm({ type: "client" }); setShowCreate(true); }}><Building2 className="w-4 h-4 mr-1" />Add Company</Button>
            <Button size="sm" onClick={() => { setCreateType("contact"); setForm({ type: "client" }); setShowCreate(true); }}><Plus className="w-4 h-4 mr-1" />Add Contact</Button>
          </div>
        }
      />

      <div className="mb-4 relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      <Tabs defaultValue="contacts">
        <TabsList className="mb-4">
          <TabsTrigger value="contacts">Contacts ({fc.length})</TabsTrigger>
          <TabsTrigger value="companies">Companies ({fco.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="contacts">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden sm:table-cell">Company</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                </tr></thead>
                <tbody>
                  {fc.map(c => (
                    <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                      <td className="py-3 px-4 font-medium">{c.first_name} {c.last_name}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden sm:table-cell">{c.company_name || "—"}</td>
                      <td className="py-3 px-4"><StatusBadge label={c.type || "client"} color={TYPE_COLORS[c.type] || "slate"} /></td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{c.phone || c.mobile || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{c.email || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fc.length === 0 && <EmptyState icon={Users} title="No contacts found" actionLabel="Add Contact" onAction={() => { setCreateType("contact"); setShowCreate(true); }} />}
          </Card>
        </TabsContent>
        <TabsContent value="companies">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Company</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Phone</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Location</th>
                </tr></thead>
                <tbody>
                  {fco.map(c => (
                    <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer">
                      <td className="py-3 px-4 font-medium">{c.name}</td>
                      <td className="py-3 px-4"><StatusBadge label={c.type || "client"} color={TYPE_COLORS[c.type] || "slate"} /></td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{c.phone || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{c.email || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{c.city ? `${c.city}, ${c.state}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fco.length === 0 && <EmptyState icon={Building2} title="No companies found" actionLabel="Add Company" onAction={() => { setCreateType("company"); setShowCreate(true); }} />}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{createType === "contact" ? "New Contact" : "New Company"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {createType === "contact" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>First Name *</Label><Input value={form.first_name || ""} onChange={e => setForm({...form, first_name: e.target.value})} /></div>
                  <div><Label>Last Name *</Label><Input value={form.last_name || ""} onChange={e => setForm({...form, last_name: e.target.value})} /></div>
                </div>
              </>
            ) : (
              <div><Label>Company Name *</Label><Input value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} /></div>
              <div><Label>Phone</Label><Input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} /></div>
            </div>
            <div><Label>Type</Label>
              <Select value={form.type || "client"} onValueChange={v => setForm({...form, type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createType === "contact" ? (!form.first_name || !form.last_name) : !form.name}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}