import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.task.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.enquiry.deleteMany();
  await prisma.customer.deleteMany();

  const customers = [
    {
      type: 'designer',
      businessName: 'Millbrook Interiors',
      primaryContactName: 'Sarah Evans',
      email: 'sarah@millbrookinteriors.com',
      phone: '020 7123 4567',
      address: '45 Design Street, London',
      tags: 'repeat,high value',
      referralSource: 'network',
      notes: 'Top design partner, prefers kitchen and wardrobe projects',
    },
    {
      type: 'builder',
      businessName: 'Oak & Stone Ltd',
      primaryContactName: 'Chris Martin',
      email: 'chris@oakstone.co.uk',
      phone: '020 7890 1234',
      address: '22 Construction Ave, Bristol',
      tags: 'repeat',
      referralSource: 'industry event',
      notes: 'Focus on UK regional projects',
    },
    {
      type: 'private',
      name: 'Emma Brown',
      primaryContactName: 'Emma Brown',
      email: 'emma.brown@example.com',
      phone: '07815 333 333',
      address: '10 Elm Road, Manchester',
      tags: 'new lead',
      referralSource: 'website',
      notes: 'Small bespoke furniture in home renovation',
    },
  ];

  const savedCustomers = await Promise.all(customers.map((c) => prisma.customer.create({ data: c })));

  const enquiries = [
    {
      enquiryRef: 'ENQ-0001',
      customerId: savedCustomers[0].id,
      projectName: 'Charlton Kitchen',
      projectType: 'kitchen',
      projectLocation: 'Charlton, London',
      estimatedValue: 34000,
      enquirySource: 'designer',
      stage: 'design',
      assignedTo: 'Dan',
      dateReceived: new Date('2026-03-14T09:00:00Z'),
      nextFollowUpDate: new Date('2026-04-03T10:00:00Z'),
      lastContactDate: new Date('2026-03-20T10:00:00Z'),
      quoteSentDate: new Date('2026-03-25T15:00:00Z'),
      notes: 'Designer requested updated joinery moldings and pantry details',
    },
    {
      enquiryRef: 'ENQ-0002',
      customerId: savedCustomers[1].id,
      projectName: 'Bristol Apartment Wardrobe',
      projectType: 'wardrobe',
      projectLocation: 'Bristol',
      estimatedValue: 8600,
      enquirySource: 'builder',
      stage: 'quoting',
      assignedTo: 'Maya',
      dateReceived: new Date('2026-03-10T11:00:00Z'),
      nextFollowUpDate: new Date('2026-04-01T09:00:00Z'),
      lastContactDate: new Date('2026-03-26T14:00:00Z'),
      quoteSentDate: new Date('2026-03-28T11:00:00Z'),
      notes: 'Urgent quote required for 5 built-in wardrobes',
    },
    {
      enquiryRef: 'ENQ-0003',
      customerId: savedCustomers[2].id,
      projectName: 'Manchester Laundry Fit-Out',
      projectType: 'laundry',
      projectLocation: 'Manchester',
      estimatedValue: 16500,
      enquirySource: 'private',
      stage: 'follow_up',
      assignedTo: 'Dan',
      dateReceived: new Date('2026-03-18T08:30:00Z'),
      nextFollowUpDate: new Date('2026-04-02T16:00:00Z'),
      lastContactDate: new Date('2026-03-23T16:00:00Z'),
      quoteSentDate: new Date('2026-03-24T17:00:00Z'),
      notes: 'Returning client, follow-up for installation scheduling',
    },
    {
      enquiryRef: 'ENQ-0004',
      customerId: savedCustomers[1].id,
      projectName: 'Warehouse Fit-Out',
      projectType: 'commercial_fit_out',
      projectLocation: 'Bristol',
      estimatedValue: 75000,
      enquirySource: 'builder',
      stage: 'won',
      assignedTo: 'Maya',
      dateReceived: new Date('2026-03-01T12:00:00Z'),
      nextFollowUpDate: new Date('2026-03-05T12:00:00Z'),
      lastContactDate: new Date('2026-03-05T12:00:00Z'),
      quoteSentDate: new Date('2026-03-03T12:00:00Z'),
      outcome: 'secured',
      notes: 'High-value commercial project won, starting May',
    },
    {
      enquiryRef: 'ENQ-0005',
      customerId: savedCustomers[0].id,
      projectName: 'Sitting Room Cabinets',
      projectType: 'furniture',
      projectLocation: 'London',
      estimatedValue: 12500,
      enquirySource: 'designer',
      stage: 'lost',
      assignedTo: 'Dan',
      dateReceived: new Date('2026-02-20T13:00:00Z'),
      nextFollowUpDate: null,
      lastContactDate: new Date('2026-02-25T13:00:00Z'),
      quoteSentDate: new Date('2026-02-24T10:00:00Z'),
      outcome: 'lost',
      reasonLost: 'Budget exceeded client expectations',
      notes: 'Lost to competitor with lower price',
    },
  ];

  const savedEnquiries = await Promise.all(enquiries.map((e) => prisma.enquiry.create({ data: e })));

  const activities = [
    {
      enquiryId: savedEnquiries[0].id,
      type: 'design_meeting',
      date: new Date('2026-03-20T10:00:00Z'),
      summary: 'Design meeting with Sarah',
      details: 'Agree 4 options for kitchen island and cabinetry finishes',
      createdBy: 'Dan',
    },
    {
      enquiryId: savedEnquiries[1].id,
      type: 'quote_sent',
      date: new Date('2026-03-28T11:00:00Z'),
      summary: 'Quote sent to Oak & Stone',
      details: 'Presented £8600 quote + lead times',
      createdBy: 'Maya',
    },
    {
      enquiryId: savedEnquiries[2].id,
      type: 'follow_up',
      date: new Date('2026-03-23T16:00:00Z'),
      summary: 'Follow-up call with Emma',
      details: 'Received positive feedback and requested installation options',
      createdBy: 'Dan',
    },
    {
      enquiryId: savedEnquiries[3].id,
      type: 'call',
      date: new Date('2026-03-05T12:00:00Z'),
      summary: 'Deal confirmed with Chris',
      details: 'Awarded project, contract underway',
      createdBy: 'Maya',
    },
  ];

  await Promise.all(activities.map((a) => prisma.activity.create({ data: a })));

  const tasks = [
    {
      enquiryId: savedEnquiries[0].id,
      title: 'Prepare detailed joinery drawings',
      dueDate: new Date('2026-04-01T17:00:00Z'),
      assignedTo: 'Dan',
      status: 'open',
      priority: 'high',
    },
    {
      enquiryId: savedEnquiries[1].id,
      title: 'Call builder for quote acceptance',
      dueDate: new Date('2026-04-01T09:00:00Z'),
      assignedTo: 'Maya',
      status: 'overdue',
      priority: 'high',
    },
    {
      enquiryId: savedEnquiries[2].id,
      title: 'Confirm installation date',
      dueDate: new Date('2026-04-02T16:00:00Z'),
      assignedTo: 'Dan',
      status: 'open',
      priority: 'medium',
    },
  ];

  await Promise.all(tasks.map((t) => prisma.task.create({ data: t })));

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
