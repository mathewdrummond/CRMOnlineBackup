import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import StaffMultiSelect from "@/components/StaffMultiSelect";
import AddressAutocompleteInput from "@/components/AddressAutocompleteInput";
import {
  CONTACT_PREFERRED_CHANNEL_OPTIONS,
  CONTACT_PRIORITY_OPTIONS,
  CONTACT_RELATIONSHIP_STATUS_OPTIONS,
  CONTACT_TYPE_OPTIONS,
} from "@/lib/contactHelpers";
import { mapNzAddressSuggestionToFields } from "@/lib/nzAddress";

export default function ContactFormFields({
  form,
  setForm,
  companies = [],
  showCompanySelector = true,
}) {
  const updateAddress = (nextValue, suggestion) => {
    if (!suggestion) {
      setForm({ ...form, address: nextValue });
      return;
    }

    const mapped = mapNzAddressSuggestionToFields(suggestion);
    setForm({
      ...form,
      address: mapped.address || nextValue,
      city: mapped.city || form.city || "",
      state: mapped.state || form.state || "",
      postal_code: mapped.postal_code || form.postal_code || "",
      country: mapped.country || form.country || "",
    });
  };

  const sortedCompanies = [...companies].sort((left, right) =>
    String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base", numeric: true })
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-1">
              <Label htmlFor="contact-form-prefix">Prefix</Label>
              <Input id="contact-form-prefix" value={form.honorific_prefix || ""} onChange={(event) => setForm({ ...form, honorific_prefix: event.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="contact-form-first-name">First Name</Label>
              <Input id="contact-form-first-name" value={form.first_name || ""} onChange={(event) => setForm({ ...form, first_name: event.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="contact-form-last-name">Last Name</Label>
              <Input id="contact-form-last-name" value={form.last_name || ""} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="contact-form-middle-name">Middle Name</Label>
              <Input id="contact-form-middle-name" value={form.middle_name || ""} onChange={(event) => setForm({ ...form, middle_name: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-full-name">Preferred Display Name</Label>
              <Input id="contact-form-full-name" value={form.full_name || ""} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-suffix">Suffix</Label>
              <Input id="contact-form-suffix" value={form.honorific_suffix || ""} onChange={(event) => setForm({ ...form, honorific_suffix: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="contact-form-title">Title</Label>
              <Input id="contact-form-title" value={form.title || ""} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Project Manager" />
            </div>
            <div>
              <Label htmlFor="contact-form-role">Role</Label>
              <Input id="contact-form-role" value={form.role || ""} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="e.g. Decision maker" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Contact Type</Label>
              <Select value={form.type || "client"} onValueChange={(value) => setForm({ ...form, type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Relationship</Label>
              <Select value={form.relationship_status || "active"} onValueChange={(value) => setForm({ ...form, relationship_status: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_RELATIONSHIP_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Owner</Label>
              <StaffMultiSelect
                value={form.owner || ""}
                onChange={(nextValue) => setForm({ ...form, owner: nextValue })}
                placeholder="Assign an owner"
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={form.priority || "medium"} onValueChange={(value) => setForm({ ...form, priority: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_PRIORITY_OPTIONS.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Preferred Channel</Label>
              <Select value={form.preferred_channel || "email"} onValueChange={(value) => setForm({ ...form, preferred_channel: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_PREFERRED_CHANNEL_OPTIONS.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {channel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <Switch checked={form.is_primary === true} onCheckedChange={(checked) => setForm({ ...form, is_primary: checked })} />
                <div>
                  <p className="text-sm font-medium">Primary company contact</p>
                  <p className="text-xs text-muted-foreground">Highlights this contact for the linked company.</p>
                </div>
              </div>
            </div>
          </div>

          {showCompanySelector ? (
            <div className="space-y-3">
              <div>
                <Label>Existing Company</Label>
                <Select
                  value={form.company_id || "__none"}
                  onValueChange={(value) => {
                    if (value === "__none") {
                      setForm({ ...form, company_id: "", company_name: "" });
                      return;
                    }

                    const selectedCompany = companies.find((item) => item.id === value);
                    setForm({
                      ...form,
                      company_id: value,
                      company_name: selectedCompany?.name || "",
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select a company" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No linked company</SelectItem>
                    {sortedCompanies.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!form.company_id ? (
                <div>
                  <Label htmlFor="contact-form-company-name">Company Name</Label>
                  <Input id="contact-form-company-name" value={form.company_name || ""} onChange={(event) => setForm({ ...form, company_name: event.target.value })} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="contact-form-email">Primary Email</Label>
              <Input id="contact-form-email" value={form.email || ""} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-phone">Phone</Label>
              <Input id="contact-form-phone" value={form.phone || ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="contact-form-mobile">Mobile</Label>
              <Input id="contact-form-mobile" value={form.mobile || ""} onChange={(event) => setForm({ ...form, mobile: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-website">Website</Label>
              <Input id="contact-form-website" value={form.website || ""} onChange={(event) => setForm({ ...form, website: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Additional Emails</Label>
              <Textarea value={form.extra_emails_text || ""} onChange={(event) => setForm({ ...form, extra_emails_text: event.target.value })} rows={3} placeholder="One per line" />
            </div>
            <div>
              <Label>Additional Phones</Label>
              <Textarea value={form.extra_phones_text || ""} onChange={(event) => setForm({ ...form, extra_phones_text: event.target.value })} rows={3} placeholder="One per line" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Additional Mobiles</Label>
              <Textarea value={form.extra_mobiles_text || ""} onChange={(event) => setForm({ ...form, extra_mobiles_text: event.target.value })} rows={3} placeholder="One per line" />
            </div>
            <div>
              <Label>Additional Websites</Label>
              <Textarea value={form.extra_websites_text || ""} onChange={(event) => setForm({ ...form, extra_websites_text: event.target.value })} rows={3} placeholder="One per line" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label htmlFor="contact-form-last-contacted">Last Contacted</Label>
              <Input id="contact-form-last-contacted" type="date" value={form.last_contacted_date || ""} onChange={(event) => setForm({ ...form, last_contacted_date: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-next-follow-up">Next Follow-up</Label>
              <Input id="contact-form-next-follow-up" type="date" value={form.next_follow_up_date || ""} onChange={(event) => setForm({ ...form, next_follow_up_date: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-birthday">Birthday</Label>
              <Input id="contact-form-birthday" type="date" value={form.birthday || ""} onChange={(event) => setForm({ ...form, birthday: event.target.value })} />
            </div>
          </div>

          <div>
            <Label htmlFor="contact-form-tags">Tags</Label>
            <Input id="contact-form-tags" value={form.tags_text || ""} onChange={(event) => setForm({ ...form, tags_text: event.target.value })} placeholder="vip, builder, northshore" />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="contact-form-address">Address</Label>
              <AddressAutocompleteInput
                inputId="contact-form-address"
                value={form.address || ""}
                onChange={updateAddress}
              />
            </div>
            <div>
              <Label htmlFor="contact-form-po-box">PO Box</Label>
              <Input id="contact-form-po-box" value={form.po_box || ""} onChange={(event) => setForm({ ...form, po_box: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="contact-form-city">City</Label>
              <Input id="contact-form-city" value={form.city || ""} onChange={(event) => setForm({ ...form, city: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-state">State</Label>
              <Input id="contact-form-state" value={form.state || ""} onChange={(event) => setForm({ ...form, state: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-postal">Postal Code</Label>
              <Input id="contact-form-postal" value={form.postal_code || ""} onChange={(event) => setForm({ ...form, postal_code: event.target.value })} />
            </div>
            <div>
              <Label htmlFor="contact-form-country">Country</Label>
              <Input id="contact-form-country" value={form.country || ""} onChange={(event) => setForm({ ...form, country: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="contact-form-myob-card-id">MYOB Card ID</Label>
              <Input id="contact-form-myob-card-id" value={form.myob_card_id || ""} onChange={(event) => setForm({ ...form, myob_card_id: event.target.value })} className="font-mono" />
            </div>
            <div>
              <Label htmlFor="contact-form-myob-record-id">MYOB Record ID</Label>
              <Input id="contact-form-myob-record-id" value={form.myob_record_id || ""} onChange={(event) => setForm({ ...form, myob_record_id: event.target.value })} className="font-mono" />
            </div>
          </div>

          <div>
            <Label htmlFor="contact-form-notes">Profile Notes</Label>
            <Textarea id="contact-form-notes" value={form.notes || ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} placeholder="Important context, buying preferences, project notes..." />
          </div>
        </div>
      </div>
    </div>
  );
}
