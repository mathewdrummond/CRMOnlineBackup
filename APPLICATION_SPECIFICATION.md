# Application Specification

## 1. Document Purpose

This document describes the current JoinerFlow application in business-friendly language.
It is intended to explain what the system does today, who it is for, and the main business processes it supports.

This is a description of the current live application scope, not a future-state wish list.

## 2. Application Summary

JoinerFlow is a local-first business operations application for a joinery, cabinetry, or custom manufacturing business.
It combines customer and job management with production planning, staff time capture, purchasing, inventory support, and accounting export preparation.

The application is designed to help the business:

- keep sales, quoting, delivery, and workshop operations in one place
- reduce missed follow-ups and handover gaps
- track labour against jobs and activities
- improve visibility of upcoming work, production readiness, and delivery risk
- support MYOB-based export processes without forcing staff to work inside accounting software

The application currently has two user-facing work areas:

- CRM application: used by office, admin, management, and operational staff
- Timeclock application: used for clock-in, timesheets, and payroll/export preparation

## 3. Business Objectives

The current application is intended to support the following business outcomes:

- one shared operational record for leads, contacts, quotes, jobs, time, and supporting data
- clearer handoff from enquiry and quoting into production and delivery
- more reliable labour capture by staff, activity, and job
- better planning of production, scheduling, purchasing, and stock usage
- simpler administration for payroll and MYOB export preparation
- stronger control over who can access the system and which modules are active

## 4. Primary Users

The current application supports these user groups:

- Business owners and senior managers: oversee pipeline, jobs, labour, delivery risk, and reporting
- Administrators: manage staff records, user access, module activation, corrections, and exports
- Office and sales staff: manage contacts, enquiries, follow-ups, quotes, and customer records
- Operations and production managers: manage jobs, workflow steps, scheduling, purchasing, readiness, and delivery planning
- Workshop and site staff: clock in, log time, and view the activities or jobs they are working on

## 5. Access and Security Model

The application currently uses the following access model:

- Google sign-in for user authentication
- invited-user access, so only approved users can enter the system
- two practical access levels:
- admin users, who can manage access, module settings, staff administration, and system controls
- member users, who can use the application based on the enabled business modules

The system also supports:

- session-based login management
- admin-controlled module activation
- audit visibility for administrative and record changes

## 6. Application Structure

The application is organized into core modules and optional modules.
Core modules are always required for the system to operate.
Optional modules can be turned on or off by an administrator depending on business needs.

### 6.1 Core Modules

The current core modules are:

- Operations Shell: the main application shell, home view, and shared navigation
- Admin: authentication, access control, system settings, and module recovery controls
- Staff: staff records and identities used across time tracking and planning
- Jobs: the main job record and delivery information
- Activities: operational work items and workflow steps used to run jobs
- Timeclock: clock-in, timers, and timesheet capture

### 6.2 Optional Modules

The current optional modules are:

- Dashboard: business and operational visibility
- Leads: enquiry and follow-up management
- Contacts & Companies: client and relationship management
- Quotes: pricing, quote items, approvals, and quote-to-job conversion
- Scheduling: production and labour planning views
- Suppliers: supplier records used by procurement and stock
- Purchasing: purchase orders, line items, and receiving workflows
- Stock / Inventory: inventory, stock movement, shortages, offcuts, and counts
- MYOB Export: export preparation from captured time data
- Export History: export audit trail and batch history
- Manual Entry: administrator correction or entry of time records
- Reports: cross-functional reporting and analysis

## 7. Functional Scope

### 7.1 Operations Hub

The Operations area acts as a command centre for the business.
It brings together operational summaries across jobs, follow-ups, production readiness, recent activity, and delivery pressure so managers can see what requires action.

### 7.2 Contacts and Companies

The application can maintain customer and company records, including relationship history and follow-up tasks.
This supports both sales activity and ongoing delivery communication.

Current capabilities include:

- company records
- contact records
- interaction history
- follow-up reminders and tasks
- relationship tracking across the customer lifecycle

### 7.3 Leads and Enquiries

The system can manage leads and enquiries before they become confirmed work.
This helps the business track new opportunities, follow-ups, and movement through the pipeline.

Current capabilities include:

- lead and enquiry records
- lead categories
- lead tasks and follow-up actions
- pipeline-style management of open opportunities

### 7.4 Quotes

The application supports quote preparation and commercial review.
Quotes can hold pricing detail and can later support conversion into live jobs.

Current capabilities include:

- quote records
- quote line items
- pricing structure and totals
- internal approval tracking
- support for quote-to-job conversion workflows

### 7.5 Jobs

Jobs are a central operating record in the application.
Once work is approved, the job record becomes the reference point for labour, activities, planning, attachments, and operational notes.

Current capabilities include:

- job records and status tracking
- budget and quoted value tracking
- priority and tags
- handoff readiness information
- approval and change management support
- linked notes and attachments

### 7.6 Activities and Workflow Steps

The application uses activities and job operations to break work into manageable operational steps.
These steps support workshop execution, staff attribution, scheduling, and labour capture.

Current capabilities include:

- workflow-based job operations
- estimated and actual hours
- status tracking for each activity
- assignment of staff to operational work
- support for production sequencing and readiness views

### 7.7 Scheduling

When enabled, Scheduling provides planning views for people, lanes, and operational workload.
This supports forward planning of production and install activity.

Current capabilities include:

- schedule lanes
- drag-and-drop planning
- capacity-oriented views
- sequencing of operational work

### 7.8 Staff Management

The application keeps a staff register used by timeclock, planning, and administrative workflows.

Current capabilities include:

- staff records
- employee identifiers for export use
- staff type and status
- hourly rate storage
- active team management for timeclock use

### 7.9 Time Tracking and Timesheets

Time Tracking is a major operational feature of the current application.
It allows labour to be recorded against staff, activities, and jobs while still separating raw recorded entries from what is shown to users on summary screens.

Current capabilities include:

- clock in and clock out
- active timer-based labour capture
- timesheet review
- manual time entry and corrections for administrators
- grouping of matching timesheet lines for cleaner presentation while keeping raw entries in the database
- time capture against jobs and operational activities

### 7.10 MYOB Export and Export History

The system prepares captured time data for export into MYOB-related workflows.
This reduces rework and gives administrators an export trail.

Current capabilities include:

- export-ready time data preparation
- activity slip style exports
- grouped export presentation for matching entries where appropriate
- export batch history and audit visibility

The current application supports MYOB export preparation rather than being a full accounting package.

### 7.11 Purchasing

When enabled, Purchasing supports procurement administration for jobs and general supply needs.

Current capabilities include:

- purchase order creation
- PO line items
- totals and receiving progress
- linkage of purchased items back to jobs

### 7.12 Suppliers

The application can hold supplier records for procurement and inventory use.

Current capabilities include:

- supplier company records
- supplier-linked lookups for purchasing and stock workflows

### 7.13 Stock and Inventory

When enabled, the Stock module provides visibility of materials, locations, movements, and shortages.
This supports both planning and operational control.

Current capabilities include:

- stock item records
- stock locations
- stock transactions and movement history
- stock allocations to jobs
- cycle counts and count lines
- offcut tracking
- job material requirement support

### 7.14 Reporting and Alerts

The application includes reporting and alert-oriented views for management and operational review.

Current capabilities include:

- operational dashboards
- cross-functional reporting
- alerts and exception visibility
- export history visibility
- system health and administrative review screens

## 8. Key Business Workflows Supported Today

### 8.1 Enquiry to Job Workflow

The system supports a practical flow from initial enquiry through to live delivery work:

1. create or update a company and contact
2. record a lead or enquiry
3. manage follow-ups and lead tasks
4. prepare a quote if the opportunity progresses
5. convert approved work into a live job
6. manage delivery activities, time capture, purchasing, and reporting against that job

### 8.2 Job Delivery Workflow

Once a job exists, the system supports operational control by:

1. storing the main job record
2. defining operational activities or workflow steps
3. assigning labour and tracking hours
4. planning scheduled work where scheduling is enabled
5. linking procurement, stock, notes, and attachments to the job

### 8.3 Labour Capture Workflow

The system supports labour capture by:

1. selecting a staff member
2. clocking in or entering time manually
3. attributing time to a job and activity where required
4. reviewing timesheets
5. preparing grouped export output for accounting workflows

### 8.4 Procurement and Material Workflow

When the optional modules are enabled, the system supports:

1. maintaining supplier records
2. raising purchase orders
3. recording received quantities
4. allocating stock to jobs
5. tracking stock movement, shortages, counts, and usable offcuts

## 9. Core Information Managed by the Application

The current application manages the following main information areas:

- users, access rights, and module settings
- staff records
- companies and contacts
- leads, lead categories, and follow-up tasks
- quotes and quote items
- jobs, operational activities, attachments, and notes
- schedule lanes and planning data
- suppliers and purchase orders
- stock items, allocations, transactions, counts, and offcuts
- clock-ins, timesheets, time entries, and export history
- administrative alerts and audit records

## 10. Operating Model

The current application is designed as a local-first business system.
In practical terms, this means the business operates the application against its own local data store instead of relying on a remote hosted CRM service for day-to-day usage.

Current operating characteristics include:

- business data stored locally
- application files and attachments stored locally
- support for a small operational team rather than enterprise-scale usage
- a background local stack for the CRM, timeclock, and API services
- module-based rollout, allowing the business to enable only the areas it currently needs

## 11. Business Benefits of the Current Design

The current design provides these business advantages:

- reduced fragmentation between office, workshop, and admin workflows
- a clearer operational picture of jobs and labour
- better continuity from enquiry through to production
- lower dependency on separate spreadsheets for time, purchasing, and operational tracking
- stronger control over what parts of the system are active
- practical export support for existing MYOB-based administration

## 12. Current Boundaries and Constraints

The current application should be understood with the following boundaries:

- some business areas are optional and may be turned off by an administrator
- the system is local-first and suited to a small business operating model
- MYOB support is export-oriented, not a full native accounting replacement
- business behaviour can vary depending on which modules are enabled
- this document describes the current application as it exists today, not future enhancements

## 13. Summary

The current JoinerFlow application is a modular operations platform for a joinery or custom manufacturing business.
Its present scope covers customer and enquiry management, quoting, jobs, operational activities, labour capture, scheduling, purchasing, stock support, reporting, and MYOB export preparation, with administrator control over access and enabled modules.

In business terms, the system is designed to give one connected operating environment from first enquiry through to delivered work and labour reporting.
