# API Documentation

## Base URL
```
http://localhost:4000
```

## Authentication
Currently none. Add JWT middleware at `/server/src/middleware/auth.ts` if required.

---

## Customers

### List All Customers
```
GET /api/customers
```

**Response**:
```json
[
  {
    "id": 1,
    "type": "designer",
    "businessName": "Millbrook Interiors",
    "primaryContactName": "Sarah Evans",
    "email": "sarah@millbrookinteriors.com",
    "phone": "020 7123 4567",
    "address": "45 Design Street, London",
    "tags": "repeat,high value",
    "referralSource": "network",
    "notes": "Top design partner, prefers kitchen and wardrobe projects",
    "createdAt": "2026-04-02T13:39:35.000Z",
    "updatedAt": "2026-04-02T13:39:35.000Z"
  }
]
```

### Get Customer Detail
```
GET /api/customers/:id
```

Includes related enquiries.

### Create Customer
```
POST /api/customers
```

**Body**:
```json
{
  "type": "designer",
  "businessName": "New Design Co",
  "primaryContactName": "John Doe",
  "email": "john@designco.com",
  "phone": "020 1234 5678",
  "address": "London",
  "tags": "potential,high value",
  "referralSource": "referral",
  "notes": "Excellent kitchen designer"
}
```

**Validation**:
- `type` required: private | designer | builder | architect | commercial
- `email`, `phone`, `businessName` must be unique across customers
- Returns 400 if duplicate detected

### Update Customer
```
PUT /api/customers/:id
```

All fields optional. Partial updates only.

### Delete Customer
```
DELETE /api/customers/:id
```

Cascades to delete all related enquiries.

---

## Enquiries

### List All Enquiries
```
GET /api/enquiries
```

Includes customer data.

### Get Enquiry Detail
```
GET /api/enquiries/:id
```

Includes customer, activities, and tasks.

### Create Enquiry
```
POST /api/enquiries
```

**Body**:
```json
{
  "customerId": 1,
  "projectName": "Kitchen Renovation",
  "projectType": "kitchen",
  "projectLocation": "London",
  "estimatedValue": 45000,
  "enquirySource": "designer",
  "stage": "new",
  "assignedTo": "Dan",
  "nextFollowUpDate": "2026-04-10T10:00:00Z",
  "notes": "Client wants bespoke cabinetry"
}
```

**Auto-generated**:
- `enquiryRef`: ENQ-0001, ENQ-0002, etc.
- `dateReceived`: Current time if not provided
- `createdAt`, `updatedAt`: Timestamps

**Validation**:
- `customerId` required
- `projectName` required, min 2 chars
- `projectType` required, valid: kitchen|scullery|wardrobe|laundry|bathroom|built_in_joinery|furniture|commercial_fit_out|other
- `stage` optional, default "new"
- `estimatedValue` must be ≥ 0

### Update Enquiry
```
PUT /api/enquiries/:id
```

**Common updates**:
- Move to next stage: `{ "stage": "quoting" }`
- Set follow-up: `{ "nextFollowUpDate": "2026-04-05T14:00:00Z" }`
- Mark lost (requires reason): `{ "stage": "lost", "reasonLost": "Budget exceeded" }`
- Mark won: `{ "stage": "won", "outcome": "secured" }`

**Validation**:
- If `stage` = "lost", must provide `reasonLost`

### Delete Enquiry
```
DELETE /api/enquiries/:id
```

Cascades to delete activities and tasks.

---

## Activities

### List All Activities
```
GET /api/activities
```

### Create Activity
```
POST /api/activities
```

**Body**:
```json
{
  "enquiryId": 1,
  "type": "call",
  "summary": "Initial client meeting",
  "details": "Discussed project scope and timeline",
  "createdBy": "Dan"
}
```

**Activity Types**:
- call
- email
- meeting
- site_measure
- design_meeting
- quote_sent
- follow_up
- note

**Auto-effects**:
- Updates enquiry `lastContactDate` to activity `date`
- If `nextFollowUpDate` provided, updates enquiry follow-up date

---

## Tasks

### List All Tasks
```
GET /api/tasks
```

### Create Task
```
POST /api/tasks
```

**Body**:
```json
{
  "enquiryId": 1,
  "title": "Call client for project confirmation",
  "dueDate": "2026-04-05T14:00:00Z",
  "assignedTo": "Maya",
  "priority": "high"
}
```

**Status**: Auto-set based on dueDate
- If due date < now: "overdue"
- Otherwise: "open"

**Priority**: low | medium | high

### Update Task
```
PUT /api/tasks/:id
```

```json
{
  "status": "completed"
}
```

### Delete Task
```
DELETE /api/tasks/:id
```

---

## Dashboard

### Get KPIs
```
GET /api/dashboard
```

**Response**:
```json
{
  "enquiriesThisWeek": 2,
  "activePipelineValue": 85000,
  "wonThisMonth": 75000,
  "lostThisMonth": 12500,
  "conversionRate": 50,
  "followUpsDueToday": [
    { "id": 1, "enquiryRef": "ENQ-0001", "projectName": "Charlton Kitchen", ... }
  ],
  "overdueFollowUps": [
    { "id": 2, "enquiryRef": "ENQ-0002", "projectName": "Bristol Wardrobe", ... }
  ],
  "quotesAwaiting": [
    { "id": 2, "enquiryRef": "ENQ-0002", "projectName": "Bristol Wardrobe", ... }
  ]
}
```

---

## Reports

### Get Analytics
```
GET /api/reports
```

**Response**:
```json
{
  "enquiriesBySource": [
    { "enquirySource": "designer", "_count": { "_all": 2 } },
    { "enquirySource": "builder", "_count": { "_all": 2 } }
  ],
  "enquiriesByStage": [
    { "stage": "new", "_count": { "_all": 1 } },
    { "stage": "design", "_count": { "_all": 1 } }
  ],
  "winLoss": [
    { "stage": "won", "_count": { "_all": 1 } },
    { "stage": "lost", "_count": { "_all": 1 } }
  ],
  "pipelineValue": 85000,
  "topCustomers": [...] 
}
```

---

## Error Handling

All errors return standard JSON:

```json
{
  "error": "Invalid data",
  "details": "reason"
}
```

### Status Codes
- `201`: Created
- `400`: Bad request (validation error)
- `404`: Not found
- `500`: Server error

---

## Examples

### Workflow: Create and Update Enquiry

1. **Create**:
```bash
curl -X POST http://localhost:4000/api/enquiries \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": 1,
    "projectName": "New Kitchen",
    "projectType": "kitchen",
    "estimatedValue": 25000,
    "assignedTo": "Dan"
  }'
```

Response: `{ "id": 6, "enquiryRef": "ENQ-0006", ... }`

2. **Move to design stage**:
```bash
curl -X PUT http://localhost:4000/api/enquiries/6 \
  -H "Content-Type: application/json" \
  -d '{ "stage": "design" }'
```

3. **Set follow-up**:
```bash
curl -X PUT http://localhost:4000/api/enquiries/6 \
  -H "Content-Type: application/json" \
  -d '{ "nextFollowUpDate": "2026-04-10T10:00:00Z" }'
```

4. **Log a call**:
```bash
curl -X POST http://localhost:4000/api/activities \
  -H "Content-Type: application/json" \
  -d '{
    "enquiryId": 6,
    "type": "call",
    "summary": "Design review",
    "details": "Client confirmed cabinet layout",
    "createdBy": "Dan"
  }'
```

---

## Rate Limiting
None currently. Add express-rate-limit if required.

## CORS
Enabled for all origins (`*`). Restrict in production:

```typescript
app.use(cors({ origin: process.env.CORS_ORIGIN }));
```
