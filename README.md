# Guardian Link

MASTER DEVELOPMENT PROMPT

DISASTER PREDICTION AND COMMUNITY RESPONSE SYSTEM

Enterprise Real-Time Disaster Intelligence, Early Warning, SOS & Rescue Coordination Platform

1. ROLE & OBJECTIVE

Act as an elite enterprise full-stack architect, senior frontend/backend engineer, UI/UX architect, real-time systems engineer, database architect, DevOps engineer, accessibility engineer, security engineer, and QA engineer.

Build, enhance, or modify the existing project into a production-grade Disaster Prediction and Community Response System implementing:

PREDICT → ALERT → RESPOND

The result must be functional, scalable, secure, fault-tolerant, accessible, maintainable, responsive, real-time where applicable, and suitable for mobile, Android, iOS, tablets, laptops, desktops, touchscreen laptops, and ultra-wide displays.

If an existing project is provided, inspect it first. Preserve existing routes, components, authentication, APIs, database structures, state management, design system, dependencies, and working functionality. Do not rewrite or redesign unrelated code. Modify only what is required for these requirements, bug fixes, security, responsiveness, accessibility, or architectural integration. Avoid regressions.

2. TECHNOLOGY

Use:

React

TypeScript with strict typing

Tailwind CSS

Supabase

PostgreSQL

Supabase Realtime where appropriate

PWA architecture

Service Worker

IndexedDB

Background Sync where supported

Keep business logic outside UI components:

UI
 ↓
Hooks / State
 ↓
Services
 ↓
API / Backend
 ↓
Supabase
 ↓
Database


Never expose private API keys in frontend code.

3. PLATFORM ARCHITECTURE

Unify:

Weather

Environmental data

Geographic/location data

Satellite data

IoT networks

Ground sensors

Community reports

SOS requests

Risk assessments

Alerts

Shelters

Hospitals

Emergency resources

Rescue teams

Missions

Historical information

Architecture:

Weather / Satellite / IoT / Ground Sensors / Community
                         ↓
                 DATA INGESTION
                         ↓
              VALIDATION + NORMALIZATION
                         ↓
                  RISK ENGINE / AI
                         ↓
                  RISK ASSESSMENT
                         ↓
              PREDICT → ALERT → RESPOND
                         ↓
                LIVE OPERATIONS


Each data source must be independently enabled, disabled, monitored, retried, replaced, and diagnosed.

Track:

Source name

Connection status

Last successful update

Data timestamp

Freshness

Error state

Retry state

Never represent unsupported integrations as live. Clearly label unavailable, simulated, cached, or fallback data.

4. USER ROLES

Implement secure server-side RBAC:

Community / Flooded User

Rescue Team

Administrator / Command Center

Never trust client-provided roles.

5. FLOODED USER / COMMUNITY PORTAL

Create a dedicated emergency portal optimized for frightened users, low-end devices, low bandwidth, low-light environments, and touch-only operation.

Prioritize:

SOS
CURRENT ALERT
SAFE LOCATION
SHELTER
HOSPITAL
RESCUE STATUS


Dashboard must show:

Current location

Current risk

Alert level

Active warnings

Nearest shelter

Nearest hospital

Emergency contacts

Connection status

Evacuation guidance

SOS

Required pages/features:

Emergency Dashboard

Current Risk

Live Map

Alerts

Send SOS

My SOS Status

Shelters

Hospitals

Emergency Guidance

6. COMMUNITY SOS

SOS must support:

GPS location

Optional name

Number of people

Emergency category

Severity

Description

Optional evidence/photo

Optional medical/emergency information

Timestamp

Connectivity state

Categories:

Trapped

Flooded home

Medical emergency

Injury

Missing person

Food/water shortage

Evacuation required

Elderly/child assistance

Other

Severity:

CRITICAL
HIGH
MEDIUM
LOW


Protect against double taps and duplicate submissions.

After submission distinguish clearly between:

QUEUED
SYNCING
TRANSMITTED
FAILED_RETRYING
FAILED


Never claim that rescue teams received an SOS until the backend confirms successful transmission.

7. SOS MANUAL VALIDATION

Implement:

USER SENDS SOS
 ↓
BASIC VALIDATION
 ↓
PENDING VALIDATION
 ↓
AUTHORIZED REVIEW
 ↓
VALIDATED / REJECTED / NEEDS MORE INFORMATION
 ↓
ASSIGNMENT
 ↓
DISPATCH


States:

UNVERIFIED
VALIDATED
REJECTED
NEEDS_MORE_INFORMATION
DISPATCHED
IN_PROGRESS
RESOLVED


Validation interface must display location, people affected, severity, description, GPS status, timestamp, and evidence.

Authorized operators can:

Verify

Reject

Request more information

Merge

Dismiss

Assign rescue team

Override where permitted

Record validator, timestamp, reason, notes, and assignment information.

8. SOS DUPLICATE PROTECTION

Implement server-side:

Rate limiting

Duplicate detection

Geospatial clustering

Time-window analysis

Same-user/location detection

Similar category/severity analysis

Suspicious burst detection

Do not simply block genuine emergencies.

If an active request exists:

Previous emergency request is already active.

[ VIEW ACTIVE SOS ]
[ UPDATE EXISTING REQUEST ]
[ SEND NEW REQUEST ANYWAY ]


Critical requests must remain possible.

9. GEOSPATIAL SOS CLUSTERING

Group related requests using:

Geographic proximity

Time window

Disaster zone

Emergency category

Severity

Household/user information where appropriate

Example:

SOS #1041 ─┐
SOS #1042 ─┼→ CRISIS INCIDENT #208
SOS #1043 ─┘


Clustering must never delete genuine requests.

Operators must inspect every individual SOS within a crisis incident.

Merging preserves every original record and audit history.

10. SOS DISMISSAL

Authorized dismissal requires:

Reason

Operator identity

Timestamp

Audit record

Reasons may include:

Duplicate

False report

Resolved externally

No emergency found

Unable to verify

Never permanently delete dismissed requests.

11. GPS FALLBACK

If GPS is denied, unavailable, inaccurate, or suspicious:

LOCATION COULD NOT BE CONFIRMED

[ DROP PIN ON MAP ]
[ SELECT NEAREST LANDMARK ]


Store source:

GPS
MANUAL_PIN
LANDMARK


Show the source to rescue teams.

Provide searchable/selectable landmarks such as:

School

Temple

Hospital

Bus station

Government building

Shelter

Major road

Public location

Landmark locations must be labelled approximate.

12. EMERGENCY RESOURCE ROUTING

Support:

Shelters

Hospitals

Rescue centers

Emergency services

Safe zones

Show:

Name

Distance

Directions

Availability where available

Contact

Status

Last update

Provide dynamic routing:

CURRENT LOCATION
 ↓
AVAILABLE RESOURCE
 ↓
ROAD / LOCATION DATA
 ↓
ROUTE CALCULATION
 ↓
ROUTE


Never label a route “safe” unless supporting data justifies it. If routing cannot be calculated, state that clearly.

13. RESCUE TEAM PORTAL

Create a dedicated operational interface.

Pages:

Operations Dashboard

Live Map

SOS Queue

Validation Queue

Priority Requests

Assigned Missions

Team Status

Navigation

Mission History

Dashboard shows:

Active disasters

Critical SOS

Unverified SOS

Validated SOS

Active missions

Available teams

Deployed teams

Completed missions

Shelters

Hospitals

Weather

Risk levels

14. SOS PRIORITIZATION

Calculate transparent priority using multiple factors:

Severity
People affected
People trapped
Medical emergency
Children / elderly
Injury
Water level
Risk zone
Waiting time
Location vulnerability
Distance
Verification


Example configurable weighting:

Severity             30
People affected      20
Medical emergency    20
Location risk        10
Waiting time          5
Vulnerability        5
Distance              5
Verification          5
TOTAL               100


Do not hardcode business rules throughout the UI.

Display why a request received its score.

Never use a single variable to determine rescue priority.

15. RESCUE TEAM ASSIGNMENT

Show:

Team name

Availability

Distance

Current mission

ETA

Equipment

Capacity

Current location

Prevent assigning unavailable teams unless an authorized override is explicitly confirmed.

A dispatched team cannot simultaneously appear available for the same mission.

16. MISSION STATE MACHINE

Use controlled transitions:

SUBMITTED
 ↓
PENDING_VALIDATION
 ↓
VALIDATED
 ↓
ASSIGNED
 ↓
DISPATCHED
 ↓
EN_ROUTE
 ↓
ARRIVED
 ↓
RESCUE_IN_PROGRESS
 ↓
RESOLVED


Alternative states:

REJECTED
CANCELLED
DUPLICATE
NEEDS_INFORMATION


Prevent invalid transitions. Critical state changes must be server-validated and concurrency-safe.

17. LIVE RESCUE TRACKING

When permissions/connectivity permit, display:

Team location

Destination

ETA

Mission status

Last update

If unavailable:

LIVE LOCATION TEMPORARILY UNAVAILABLE

Last known location:
2 minutes ago


Never present stale coordinates as current.

18. RISK ENGINE

Assess risk using available:

Weather

Rainfall

Wind

Temperature

Water level

Geographic vulnerability

Historical events

Community reports

SOS density

Environmental measurements

Forecasts

Sensor data

Risk levels:

0–30    LOW
31–60   MODERATE
61–80   HIGH
81–100  EXTREME


Thresholds must be centrally configurable.

Use:

LOW
MODERATE
HIGH
EXTREME / CRITICAL


Never claim certainty.

19. AI / ML ARCHITECTURE

Use:

DATA
 ↓
PREPROCESSING
 ↓
RISK MODEL
 ↓
RISK SCORE
 ↓
EXPLANATION
 ↓
ALERT


If no trained model exists, use a transparent rule-based MVP behind a replaceable risk-engine interface.

Never falsely call rule-based calculations machine learning.

Never fabricate confidence. If the actual model provides no confidence:

Confidence: Not available


Every assessment should explain contributing factors.

20. EXTREME-RISK APPROVAL

AI/rule-based extreme risk must not automatically trigger mass public alerts unless an explicitly configured emergency policy permits it.

Workflow:

RISK ENGINE
 ↓
EXTREME RISK
 ↓
AUTHORIZED REVIEW
 ↓
VERIFY DATA + FACTORS
 ↓
APPROVE / REJECT / REQUEST DATA
 ↓
MASS ALERT


Record:

Reviewer

Decision

Timestamp

Risk score

Supporting factors

Reason

Alert result

21. EARLY WARNING

Implement location-based proactive warnings.

RISK 58 → 71 → 83
 ↓
THRESHOLD EXCEEDED
 ↓
EARLY WARNING
 ↓
AFFECTED AREA
 ↓
USER + RESCUE NOTIFICATION


Warnings contain:

Disaster type

Risk level

Area

Reason

Issue time

Expected duration if available

Recommended action

Safe resource

Expiry/update time

Alert levels:

INFO
WATCH
WARNING
CRITICAL


Implement deduplication, cooldown, expiry, updates, cancellation, and escalation.

22. 24-HOUR FORECAST

Provide:

NOW   +3H   +6H   +12H   +24H
🟡     🟠    🟠     🔴     🟠


Each period shows:

Risk

Factors

Timestamp

Source

Confidence only when genuinely available

23. LIVE MAP

Provide:

Zoom

Pan

Mouse controls

Touch gestures

Marker selection

Risk zones

SOS

Rescue teams

Shelters

Hospitals

Emergency resources

Weather/environment layers

Layer selector:

Risk Zones
SOS
Rescue Teams
Shelters
Hospitals
Weather
Rainfall
Water Level


24. MARKER CLUSTERING + VIEWPORT LOADING

Use both:

Marker clustering

Viewport-based lazy loading

Only request/render records relevant to the visible map area.

ENTIRE REGION
 ↓
CURRENT VIEWPORT
 ↓
LOAD RELEVANT DATA
 ↓
CLUSTER
 ↓
RENDER


On pan/zoom update the viewport, fetch necessary records, remove irrelevant records, and rerender.

Optimize for low-memory mobile/Android devices. Never load thousands of markers unnecessarily.

25. DATA INGESTION

Explicitly support architecture for:

Weather APIs

Satellite sources

IoT networks

Ground sensors

Environmental APIs

Geographic data

Community reports

Each source exposes:

CONNECTED
DEGRADED
STALE
FAILED


and:

source
timestamp
last_successful_update
freshness
error
retry


Never claim unsupported satellite/IoT sources are live.

26. WEATHER

Use backend/service integration.

Display:

Current weather

Rainfall

Wind

Temperature

Humidity

Forecast

Severe-weather indicators

Timestamp

Never expose private API keys.

Never show fabricated current weather.

27. DATA TRANSPARENCY

Every critical data component must distinguish:

LIVE
RECENT
STALE
CACHED
SIMULATED
UNAVAILABLE


Cached/fallback/simulated data must never visually appear identical to live information.

28. FAILOVER

Use:

PRIMARY
 ↓
FAILURE
 ↓
RETRY
 ↓
SECONDARY
 ↓
FAILURE
 ↓
LAST-KNOWN CACHE
 ↓
STALE/CACHED LABEL


Never silently invent missing values.

29. SYSTEM DIAGNOSTICS

Admin Command Center monitors:

Weather API
Satellite Feed
IoT Feed
Ground Sensors
Map Service
Database
Realtime
Notifications
Risk Engine


Allow authorized admins to:

RETRY SOURCE
DISABLE SOURCE
ENABLE FALLBACK


Fallback/demo sources must be explicitly labelled.

Never silently substitute simulated data.

30. OFFLINE-FIRST ARCHITECTURE

Explicitly implement:

Service Worker

IndexedDB

Background Sync where supported

Local SOS queue

Emergency-resource cache

Last-known risk

Last-known alerts

Synchronization queue

Use IndexedDB for structured emergency data rather than relying only on localStorage.

SOS flow:

OFFLINE
 ↓
CREATE SOS
 ↓
INDEXEDDB
 ↓
QUEUED
 ↓
CONNECTION RESTORED
 ↓
BACKGROUND SYNC / RETRY
 ↓
SERVER ACK
 ↓
TRANSMITTED


Never mark queued SOS as received before server acknowledgement.

31. SYNC FAILURE

On synchronization failure:

Preserve SOS

Retry with exponential backoff

Prevent duplicate transmission

Preserve original timestamp

Preserve original location

Display actual state

States:

QUEUED
SYNCING
TRANSMITTED
FAILED_RETRYING
FAILED


Never lose an emergency request due to temporary connectivity failure.

32. OFFLINE USER EXPERIENCE

Cache:

Emergency contacts

Basic instructions

Last-known shelters

Last-known hospitals

Last-known risk

Essential UI resources

Show:

OFFLINE MODE
Last updated: [time]
Data may be outdated.


Clearly distinguish unavailable live features.

Connection indicator:

🟢 LIVE
🟡 RECONNECTING
🔴 OFFLINE


Avoid intrusive repeated popups.

33. CRISIS-MODE MOBILE

During an active disaster, prioritize:

SOS
CURRENT ALERT
SAFE LOCATION
SHELTER
HOSPITAL
RESCUE STATUS


Collapse/defer secondary analytics without removing required access.

34. COMMUNITY REPORTING

Allow reports for:

Flooding

Blocked roads

Fallen trees

Rising water

Infrastructure damage

Missing people

Unsafe areas

Resource shortages

Workflow:

SUBMITTED
 ↓
AUTOMATIC VALIDATION
 ↓
OPTIONAL MANUAL REVIEW
 ↓
VERIFIED / UNVERIFIED
 ↓
RISK ENGINE


Never treat unverified reports as confirmed facts.

35. DISASTER TYPES

Support:

Flood

Cyclone

Landslide

Urban flooding

Architecture must allow additional disaster types without rewriting the system.

Flood features:

Water level

Flood risk

Safe zones

Shelters

Hospitals

Evacuation

Flooded-road reports

SOS

Cyclone:

Wind

Rainfall

Forecast

Cyclone proximity

Alert level

Evacuation

Landslide:

Rainfall

Terrain vulnerability

Community reports

Road blockage

High-risk zones

Urban flooding:

Rainfall intensity

Low-lying areas

Water accumulation

Drainage reports

Road blockage

SOS

Never claim accurate prediction without appropriate validated data/modeling.

36. ADMIN COMMAND CENTER

Provide:

Threat overview

Risk forecast

SOS management

Validation

Rescue teams

Resources

Alerts

Data sources

Analytics

Audit logs

System health

Users

Disaster events

Risk configuration

Threat overview must show multiple threatened areas.

Response dashboard must show:

Active threats

Active SOS

Deployed units

Risk forecast

24-hour risk

Model confidence only when available

37. ANALYTICS

Show actual data only:

SOS count

Average response time

Validation time

Resolution time

Active disasters

Risk distribution

Resource utilization

Rescue performance

Alert frequency

Community reports

If data does not exist:

No data available


Never fabricate metrics.

Support historical analysis of disasters, risk, SOS, rescue response, alerts, and resources.

38. DATABASE

Use normalized maintainable entities such as:

users
roles
rescue_teams
team_members
disaster_events
risk_assessments
risk_factors
alerts
sos_requests
sos_validation
rescue_assignments
missions
community_reports
emergency_resources
shelters
hospitals
weather_snapshots
locations
notifications
audit_logs
system_events


Use proper keys, indexes, timestamps, status fields, relationships, and soft deletion where appropriate.

39. REAL-TIME SYNCHRONIZATION

Use Supabase Realtime efficiently for:

New SOS

Validation updates

Assignments

Mission status

Risk changes

Alerts

Team status

Clean up listeners on unmount and prevent duplicate subscriptions.

Reconnect safely after network loss.

40. EMERGENCY STATE INTEGRITY

Use server-side validation, transactions, constraints, and concurrency-safe operations.

Guarantee:

SOS cannot be both rejected and dispatched.

Merged SOS remains in audit history.

Dispatched team cannot be simultaneously available for the same mission.

Rejected alert cannot appear approved.

Queued SOS cannot appear server-received.

Stale location cannot appear live.

Two operators modifying the same SOS must not create contradictory states. Revalidate server state before critical operations.

41. ALERT / NOTIFICATION SYSTEM

Support where infrastructure permits:

In-app

Push

Email

SMS

Priorities:

INFO
WARNING
HIGH
CRITICAL


Avoid duplicate notifications and respect appropriate preferences except policy-required critical alerts.

42. SECURITY

Implement:

RBAC

Server authorization

Input validation

Output sanitization

Secure API handling

Rate limiting

Abuse prevention

Audit logging

Secure sessions

Database access controls

Least privilege

Location data is sensitive. Collect only what is necessary and expose it only to authorized users who require it.

43. RESPONSIVE DESIGN

The UI must work at:

320
360
375
390
412
480
768
820
1024
1280
1440
1920
2560+


and any intermediate size.

Support:

Android

iPhone/iOS

Tablets

Foldables

Laptops

Desktops

Touchscreen laptops

Ultra-wide screens

Portrait/landscape rotation

Use responsive CSS grid/flexbox, fluid typography, safe areas, flexible cards, and container queries where useful.

Prevent:

Horizontal overflow

Clipping

Overlapping

Broken dialogs

Off-screen buttons

Fixed-width layouts

Broken maps

Unusable tables

44. NAVIGATION

Desktop may use sidebar navigation.

Mobile may use bottom navigation or compact menu according to the existing design.

Emergency SOS must remain immediately accessible.

Routes such as:

/
 /login
 /dashboard
 /map
 /alerts
 /sos
 /resources
 /rescue
 /rescue/missions
 /admin
 /reports


must work directly and after refresh.

Configure deployment routing so valid routes never produce a false “Page Not Found”.

45. RESPONSIVE TABLES / MAP

Tables should become cards on small screens.

Map:

Desktop → Map + Side Panel
Mobile  → Map + Bottom Sheet


The map must resize correctly and support touch/mouse interactions.

46. TOUCH + MOUSE + KEYBOARD

Support:

Mouse

Click, hover, drag, scroll.

Touch

Tap, swipe, scroll, pinch-to-zoom where appropriate.

Keyboard

Navigation, focus, forms, dialogs.

Prevent double firing between mouse/touch events.

Never make essential functionality hover-only.

47. ACCESSIBILITY

Implement:

Semantic HTML

Appropriate ARIA

Keyboard navigation

Visible focus

Large touch targets

Contrast

Accessible labels

Screen-reader announcements

Reduced-motion support

Non-color-only status indicators

Emergency status must use labels/icons in addition to color.

48. UI / DESIGN SYSTEM

Use a futuristic but trustworthy enterprise emergency-response design.

Style:

Clean

Professional

Modern

High-tech

Clear

Polished

User-friendly

User-interactive

User-responsive

Maintainable

Use consistent typography, spacing, icons, cards, borders, shadows, status indicators, and semantic colors.

Do not let decoration interfere with emergency operations.

Respect prefers-reduced-motion.

49. LOADING / ERROR STATES

Every asynchronous operation requires clear loading and error states.

Examples:

Loading weather...
Analyzing risk...
Finding shelters...
Submitting SOS...
Validating request...
Assigning team...
Updating mission...


Errors must be understandable and actionable.

Never leave blank screens.

50. FORM / SOS VALIDATION

Validate client and server side.

Validate:

Required fields

Coordinates

People count

Severity

Description

File type/size

Malicious input

Duplicate submissions

Invalid coordinates

Protect critical buttons from rapid repeated activation.

After first activation show:

Submitting...


until server success/failure.

51. SOS LOCATION CONFIRMATION

Before sending, show concise confirmation:

SEND EMERGENCY SOS?

Location: Available
People: 4
Severity: Critical

[ SEND SOS ]
[ CANCEL ]


Do not introduce unnecessary confirmation steps.

After successful transmission:

SOS SENT
Request ID: #1042
Status: Awaiting validation
Location: Received


If offline:

SOS NOT YET TRANSMITTED

Stored locally.
Retrying automatically.

Do not assume rescue teams have received it.


52. COMMUNITY SOS STATUS

Allow users to track:

Submitted ✓
Validated ✓
Team Assigned ✓
Dispatched ✓
En Route ✓
Arrived ○
Rescue ○
Resolved ○


After dispatch show team, ETA, status, and last update.

53. RESCUE MOBILE MODE

Rescue personnel must have a compact operational interface:

CURRENT MISSION

SOS #1042
2.1 km
CRITICAL
5 people
Medical: YES

[ NAVIGATE ]
[ CALL ]
[ UPDATE STATUS ]


Status controls:

ACCEPT
EN ROUTE
ARRIVED
RESCUE STARTED
RESOLVED


Use large touch targets and minimal text.

54. ADMIN DESKTOP MODE

Provide full command-center experience with:

Multi-panel dashboard

Map

Threat overview

SOS queue

Team management

Alerts

Risk forecast

Analytics

Collapse responsively on smaller screens.

55. AUDIT LOGGING

Record every sensitive operation:

Who
What
When
Where
Previous state
New state
Reason


Examples:

SOS validation/rejection

Merge/dismiss

Mission assignment/reassignment

Alert approval/cancellation

Risk threshold changes

Role changes

Team status changes

Admin overrides

Fallback activation

56. ADMIN OVERRIDE

Authorized overrides require:

Confirmation

Reason

Operator identity

Timestamp

Audit record

Visible override indicator

Never silently override safety-critical states.

57. DEMO MODE

If real integrations are unavailable, provide controlled Demo Mode.

Clearly display:

DEMO MODE
⚠ DATA IS SIMULATED


Demo may simulate:

Rainfall increase

Rising water

Risk escalation

SOS

Dispatch

Alerts

Never represent demo data as live.

58. FEATURE FLAGS

Use configurable flags such as:

ENABLE_LIVE_WEATHER
ENABLE_PUSH_NOTIFICATIONS
ENABLE_AI_RISK_MODEL
ENABLE_OFFLINE_QUEUE
ENABLE_DEMO_MODE


Optional integrations must not crash the application.

59. ENVIRONMENT CONFIGURATION

Use environment variables for:

API URLs

Public configuration

Map configuration

Supabase settings

Notification settings

Feature flags

Never commit secrets.

Provide an example environment file without credentials.

60. PERFORMANCE

Optimize:

Initial load

Map rendering

API requests

Database queries

Images

Bundle size

Realtime subscriptions

Large lists

Use where appropriate:

Lazy loading

Code splitting

Pagination

Virtualization

Debouncing

Request cancellation

Memoization

Do not over-optimize unnecessarily.

61. DATA CONSISTENCY

Use centralized status/state definitions.

Never show contradictory states such as:

RESOLVED


and:

TEAM EN ROUTE


simultaneously.

Backend remains the source of truth.

62. FAILURE HANDLING

Gracefully handle:

API failure

API timeout

GPS denial

GPS inaccuracy

Network failure

Database failure

Authentication failure

Expired sessions

Map failure

Notification failure

Duplicate SOS

Invalid coordinates

Invalid API responses

Missing weather

Stale data

Conflicting sources

Realtime disconnects

Do not crash or freeze the interface.

Preserve unsaved/queued emergency data where possible.

63. PWA

Where practical provide:

Installable application

Manifest

Icons

Service Worker

Offline shell

Appropriate cache strategies

Push support

Safe update behavior

Do not insecurely cache private information.

64. SOURCE TRANSPARENCY

Display relevant sources and timestamps:

Data sources:
Weather API
Ground Sensors
Community Reports

Last updated:
10:45 PM


For every critical feed distinguish current/live, stale, cached, simulated, or unavailable.

65. TESTING

Test:

Functional

Login, RBAC, SOS, validation, merge, dismiss, assignment, mission lifecycle, alerts, map, risk engine, weather, resources, reports, offline queue, synchronization.

Responsive

320px through 2560px+ and intermediate sizes.

Interaction

Mouse, touch, keyboard, swipe, pinch, scroll, resize, orientation.

Edge Cases

GPS denied/unavailable/inaccurate, offline, reconnect, API failure, database failure, duplicate SOS, concurrent validation, concurrent assignment, expired login, invalid role, invalid coordinates, empty forms, long text, slow API, rapid clicks, double SOS, refresh, browser navigation, rotation, permissions denied, low-memory devices.

66. REFRESH / RECONNECT

After refresh or reconnect:

Restore authentication

Restore valid route

Restore filters where possible

Reconnect realtime

Prevent duplicate listeners

Reload current data

Restore offline queue

Preserve unsent data where possible

Do not show blank pages or broken routes.

67. API / COMPONENT ARCHITECTURE

Keep reusable services for:

Risk calculation

Notifications

Validation

SOS

Routing

Data ingestion

Synchronization

Use reusable components such as:

RiskBadge
AlertCard
SOSCard
SOSPriorityBadge
MapContainer
MapLayerControl
ResourceCard
RescueTeamCard
MissionCard
WeatherCard
RiskForecast
ConnectionStatus
OfflineBanner
LoadingState
ErrorState
ValidationDialog


Avoid giant components and duplicated business logic.

68. EMERGENCY LANGUAGE

Community messages must be short and action-oriented:

⚠ HIGH FLOOD RISK

Move to higher ground.

Nearest shelter:
1.8 km

[ GET DIRECTIONS ]


Avoid technical terminology in user-facing emergency messages.

69. DATA PRIVACY

Collect only necessary location and emergency information.

Private user locations must not be publicly exposed.

Rescue personnel should see only mission-relevant information.

Use server-side authorization for all sensitive operations.

70. PPT ALIGNMENT

Preserve the supplied PPT's core concepts:

Fragmented emergency information

Early prediction

Real-time monitoring

Weather/API data

Ground sensors

AI/ML analysis

Risk prediction

Interactive map

Emergency alerts

Shelter/hospital discovery

SOS

Rescue prioritization

Response dashboard

Offline/low-connectivity support

Predict → Alert → Respond

Future IoT, satellite, and advanced AI extensibility

Do not falsely represent future-scope integrations as already live.

71. CORE USER JOURNEYS

Community

OPEN APP
 ↓
LOCATION
 ↓
CURRENT RISK
 ↓
ALERT
 ↓
SOS / SHELTER / HOSPITAL
 ↓
TRACK RESPONSE


Rescue

OPEN OPERATIONS
 ↓
VIEW THREATS
 ↓
VIEW PRIORITIZED SOS
 ↓
VALIDATE
 ↓
ASSIGN
 ↓
DISPATCH
 ↓
TRACK
 ↓
RESOLVE


Admin

LOGIN
 ↓
SYSTEM OVERVIEW
 ↓
MONITOR SOURCES
 ↓
MONITOR RISKS
 ↓
APPROVE ALERTS
 ↓
MANAGE SOS
 ↓
MANAGE TEAMS
 ↓
MANAGE RESOURCES
 ↓
AUDIT


72. PREDICT → ALERT → RESPOND

PREDICT

Collect, normalize, validate, and analyze weather, environmental, satellite, IoT, sensor, geographic, and community data.

ALERT

Generate explainable early warnings, notify affected users/responders, and require configured manual approval for extreme mass alerts.

RESPOND

Validate SOS, prioritize requests, cluster related incidents, assign teams, route responders, track missions, and resolve incidents.

73. NON-NEGOTIABLE RULES

Before completion verify:

Existing working functionality remains intact.

Only necessary code is changed.

No fake live data.

Live/cached/stale/simulated/unavailable states are distinct.

Flooded User portal exists.

Rescue Team portal exists.

Manual SOS validation exists.

SOS merge/dismiss exists.

Geospatial clustering exists.

Server-side rate limiting exists.

GPS pin-drop and landmark fallback exist.

Dynamic routing exists.

Rescue prioritization is explainable.

Rescue assignment is concurrency-safe.

Mission state transitions are controlled.

Extreme-risk alerts support manual approval.

Satellite/IoT/ground-sensor ingestion architecture exists.

Service Worker + IndexedDB + offline queue exist.

Background Sync/retry exists where supported.

Marker clustering + viewport loading exist.

Crisis mobile optimization exists.

Data-source diagnostics and controlled failover exist.

Emergency state integrity is enforced server-side.

Audit logging exists.

RBAC exists.

Real-time synchronization exists.

Offline operation is clearly labelled.

API failures do not crash the application.

SOS is never marked received before server acknowledgement.

Stale locations are never shown as live.

Model confidence is never fabricated.

Predictions are never presented as certainty.

Private API keys are never exposed.

Private location data is protected.

Mouse, touch, keyboard, and responsive interactions work.

Mobile, Android, iOS, tablet, laptop, desktop, touchscreen, and ultra-wide layouts work.

No horizontal overflow or broken dialogs.

Refresh and direct routes work.

Reconnect works.

Duplicate subscriptions are prevented.

Double submissions are prevented.

Analytics are never fabricated.

Demo data is explicitly labelled.

Accessibility requirements are met.

Complete regression and edge-case testing is performed.

74. FINAL DELIVERY STANDARD

The final application must feel like a real emergency-response platform rather than a basic college CRUD project.

Prioritize:

CORRECTNESS → SAFETY → DATA INTEGRITY → USABILITY → PERFORMANCE → VISUAL POLISH

The finished platform must demonstrate:

PREDICT

Real-time data + risk assessment + early warning

↓

ALERT

Timely, explainable warnings + affected-area notifications

↓

RESPOND

Validated SOS + intelligent prioritization + rescue dispatch + live tracking

The final product should transform fragmented emergency information into one coordinated operational system.

FASTER INFORMATION. FASTER RESPONSE. SAFER COMMUNITIES.
ADDITIONAL CLARIFICATION REQUIREMENTS

# 75. IDEMPOTENT EMERGENCY OPERATIONS

All critical operations must use idempotency protection.

SOS creation, SOS synchronization, validation, merging, dismissal, assignment, dispatch, alert creation, and mission-status updates must include a unique operation/request identifier.

If the same operation is submitted multiple times because of retries, reconnects, double taps, browser refreshes, or background synchronization, the backend must process it only once.

Never create duplicate emergency records because a request was retried.

# 76. SERVER-AUTHORITATIVE STATE

For all emergency-critical operations, the backend/database must be the final source of truth.

The frontend may optimistically display progress, but must reconcile its state with the server response.

Never allow client-side state alone to determine:

- SOS received status
- SOS validation
- Rescue assignment
- Team availability
- Mission status
- Alert approval
- Risk approval
- Administrative permissions

# 77. RESCUE TEAM AVAILABILITY LOCKING

When a rescue team is assigned to a mission, reserve/lock that team atomically.

The system must prevent two operators from assigning the same available team to different missions simultaneously.

When a mission is cancelled or resolved, correctly release the team back to the available pool.

# 78. EMERGENCY ALERT DELIVERY STATUS

Track emergency notification delivery states where supported:

```text
CREATED
QUEUED
SENDING
DELIVERED
FAILED
EXPIRED
CANCELLED

Do not claim that an alert was delivered merely because it was created successfully.

Display the actual notification state to authorized operators.

79. ALERT ACKNOWLEDGEMENT

Where technically supported, allow rescue operators/admins to acknowledge critical alerts.

Track:

 Alert ID

 Recipient

 Acknowledgement status

 Acknowledgement timestamp

 Operator/user identity

Critical alerts that remain unacknowledged should be visible in the operations dashboard.

80. GEOFENCED ALERTING

Support configurable geographic targeting for disaster alerts.

An alert should be associated with:

 Disaster zone

 Geographic boundary

 Severity

 Start time

 Expiry time

Only users/responders inside the appropriate affected area should receive targeted alerts unless an authorized emergency policy specifies broader distribution.

81. ALERT ESCALATION

Support controlled escalation:

WATCH
 ↓
WARNING
 ↓
CRITICAL

When risk increases, update the existing incident/alert where appropriate instead of creating unnecessary duplicate alerts.

Every escalation must be auditable.

82. INCIDENT-CENTRIC ARCHITECTURE

Multiple SOS requests, alerts, reports, risk assessments, and rescue missions should be linkable to a common disaster/crisis incident.

Example:

DISASTER INCIDENT #208
        │
        ├── Risk Assessment
        ├── Alerts
        ├── SOS #1041
        ├── SOS #1042
        ├── Community Reports
        ├── Rescue Mission
        └── Audit History

This provides a single operational view of the complete emergency.

83. SOS UPDATE WITHOUT DUPLICATION

Allow a user to update an existing active SOS when circumstances change.

Examples:

 More people became trapped

 Medical condition worsened

 Water level increased

 Location changed

 Rescue is no longer required

Updates must modify the existing emergency context rather than automatically generating another SOS.

Maintain the complete update history.

84. LOCATION CONFIDENCE

Every emergency location must store a location-confidence indicator where possible.

Example:

GPS
Accuracy: 12 m
Confidence: HIGH

MANUAL PIN
Confidence: MEDIUM

LANDMARK
Confidence: APPROXIMATE

Rescue operators must clearly see whether a location is precise or approximate.

85. LOCATION TIMESTAMP

Every rescue-team and user location must include its last-known timestamp.

Example:

LIVE LOCATION
Updated 18 seconds ago

or:

LAST KNOWN LOCATION
Updated 8 minutes ago

Never display an old coordinate as a live position.

86. SAFE-ROUTE VALIDATION

The system must never label a route as "safe" solely because it is the shortest route.

Route safety must consider available disaster/location information such as:

 Flooded roads

 Road closures

 Disaster zones

 Blockages

 Current conditions

If safety cannot be verified, use wording such as:

ROUTE AVAILABLE
Safety status cannot be confirmed.

87. EMERGENCY RESOURCE DATA QUALITY

Shelters, hospitals, and emergency resources must support:

ACTIVE
INACTIVE
FULL
UNKNOWN
TEMPORARILY UNAVAILABLE

Do not assume that a resource is operational simply because it exists in the database.

88. RESOURCE LAST-VERIFIED INFORMATION

Emergency resources should store:

 Last verified time

 Verification source

 Current availability

 Contact information

 Location accuracy

Display stale resource information clearly.

89. BACKEND TRANSACTIONAL STATE MACHINE

Critical state transitions must be enforced at the database/backend layer rather than only through frontend buttons.

Reject invalid transitions server-side.

Examples:

REJECTED → DISPATCHED

must fail unless an authorized override process explicitly permits it.

AVAILABLE TEAM → ASSIGNED

must occur atomically.

90. RETRY SAFETY

Every retryable operation must be classified as:

SAFE TO RETRY
NOT SAFE TO RETRY
IDEMPOTENT

Never blindly retry a non-idempotent emergency operation.

Use request identifiers and server-side deduplication for retryable operations.

91. OFFLINE QUEUE PRIORITY

Offline operations must have a priority-aware queue.

Critical SOS transmissions must be processed before non-critical background synchronization.

Example:

CRITICAL SOS
    ↓
EMERGENCY ALERT
    ↓
MISSION UPDATE
    ↓
COMMUNITY REPORT
    ↓
NON-CRITICAL DATA SYNC

92. OFFLINE QUEUE VISIBILITY

Provide a small emergency synchronization indicator showing:

3 requests waiting to transmit

Users must be able to inspect their own queued emergency requests.

Never expose another user's private queued data.

93. SERVICE WORKER UPDATE SAFETY

Service-worker updates must not interrupt an active emergency workflow.

Do not unexpectedly reload the application while:

 Sending an SOS

 Completing a rescue operation

 Filling a critical emergency form

Use a controlled update strategy.

94. OBSERVABILITY

Implement structured application monitoring for production.

Monitor:

 API failures

 Database failures

 Real-time disconnects

 SOS transmission failures

 Background-sync failures

 Notification failures

 Authentication failures

 Map failures

 Risk-engine failures

 Excessive response latency

Do not log sensitive personal information unnecessarily.

95. HEALTH CHECKS

Provide backend/service health checks for critical infrastructure.

Each service should expose an appropriate health state:

HEALTHY
DEGRADED
UNAVAILABLE

Health checks must not expose credentials or sensitive internal information.

96. DATABASE BACKUP AND RECOVERY

Design the database architecture for backup and disaster recovery.

Emergency records, audit logs, SOS history, mission history, and alert history must not depend on temporary frontend storage.

Document appropriate recovery expectations for production deployment.

97. DATA RETENTION AND PRIVACY

Define retention policies for:

 SOS locations

 Rescue-team locations

 Audit logs

 Community reports

 Notifications

 Historical disaster information

Retain information required for emergency operations and auditing while avoiding unnecessary long-term storage of sensitive location information.

98. MANUAL VALIDATION RESPONSIBILITY

Clearly identify which roles are authorized to perform each manual action.

Example:

COMMUNITY USER
→ Submit SOS

RESCUE OPERATOR
→ Validate SOS
→ Assign team
→ Update mission

ADMIN
→ Override
→ Approve mass alerts
→ Configure risk policies
→ Manage system sources

Do not rely only on hidden frontend buttons for authorization.

99. FOUR-EYES APPROVAL FOR HIGH-RISK ACTIONS

Where configured by policy, support optional dual authorization for extremely sensitive operations such as:

 Mass emergency alert

 Large-area evacuation alert

 Critical risk-policy changes

 Destructive administrative actions

The system should support:

REQUEST APPROVAL
      ↓
SECOND AUTHORIZED REVIEWER
      ↓
APPROVED / REJECTED

100. AUDIT IMMUTABILITY

Audit records must not be silently edited or deleted by ordinary administrators.

If an audit correction is necessary, create a new corrective audit event instead of modifying the original historical record.

101. TIME SYNCHRONIZATION

All backend emergency timestamps must use a consistent server-authoritative time standard.

Display times in the user's local timezone while retaining the canonical timestamp internally.

Do not rely on the user's device clock for security-critical ordering.

102. DISASTER INCIDENT RECOVERY

If the application crashes, refreshes, loses connectivity, or restarts during an active incident:

RESTORE SESSION
      ↓
RESTORE SERVER STATE
      ↓
RESTORE OFFLINE QUEUE
      ↓
RECONNECT REAL-TIME SERVICES
      ↓
RECONCILE STATE
      ↓
CONTINUE OPERATION

The system must recover without creating duplicate SOS requests, missions, alerts, or assignments.

103. FINAL EMERGENCY PRINCIPLE

For every emergency-critical feature, design for:

NO INTERNET
NO GPS
NO NOTIFICATION
NO REAL-TIME CONNECTION
NO PRIMARY API
NO PERFECT DATA
NO PERFECT DEVICE
NO PERFECT USER INPUT

The system must degrade gracefully while clearly communicating what is unavailable.

It must never silently invent information, falsely confirm emergency delivery, or present uncertain information as fact.


These additions are **clarifications and additional production safeguards**, not replacements for anything already in your prompt.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cd584789-c902-418f-8aad-123b36dc401d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
