/**
 * Starter diagrams. Every template is deliberately small, dependency-free and
 * valid for the bundled engine versions (PlantUML 1.2026.x, Mermaid 12.x).
 */
export const templates = [
  // ---------------------------------------------------------------- PlantUML
  {
    id: 'puml-sequence',
    language: 'plantuml',
    name: '下单支付流程',
    description: 'Sequence · 参与者、消息、注释',
    code: `@startuml
title Order checkout flow
autonumber
actor Customer
participant "Web App" as Web
participant "API Gateway" as API
participant "Order Service" as Orders
database "PostgreSQL" as DB

Customer -> Web : Submit order
Web -> API : POST /orders
API -> Orders : createOrder(payload)
Orders -> DB : INSERT order
DB --> Orders : order_id
Orders --> API : 201 Created
API --> Web : { id, status: "paid" }
Web --> Customer : Show confirmation

note right of Orders
  Idempotent by request id
  Payment timeout: 30 minutes
end note
@enduml`,
  },
  {
    id: 'puml-class',
    language: 'plantuml',
    name: '领域模型',
    description: 'Class · 继承、关联、枚举',
    code: `@startuml
skinparam classAttributeIconSize 0
hide circle
title Workspace domain model

class User {
  +UUID id
  +String email
  +String passwordHash
  +login(password) : bool
}

class Workspace {
  +UUID id
  +String name
  +invite(email) : void
}

class Diagram {
  +UUID id
  +DiagramKind kind
  +String source
  +export(format) : Blob
}

enum DiagramKind {
  PLANTUML
  MERMAID
}

User "1" -- "*" Workspace : owns
Workspace "1" -- "*" Diagram : contains
Diagram --> DiagramKind
@enduml`,
  },
  {
    id: 'puml-activity',
    language: 'plantuml',
    name: 'CI/CD 流水线',
    description: 'Activity · 判断、并行、回滚',
    code: `@startuml
title Release pipeline
start
:Commit pushed to main;
if (Lint + type check?) then (pass)
  :Build container image;
  :Run unit tests;
  if (Tests green?) then (yes)
    :Deploy to staging;
    :Smoke test critical paths;
    if (Smoke test ok?) then (yes)
      :Promote to production;
      :Notify #releases;
    else (no)
      :Roll back staging;
    endif
  else (no)
    :Report failing tests;
  endif
else (fail)
  :Post review comments;
endif
stop
@enduml`,
  },
  {
    id: 'puml-component',
    language: 'plantuml',
    name: '系统架构',
    description: 'Component · 服务、数据库、消息队列',
    code: `@startuml
skinparam componentStyle rectangle
title Diagram platform architecture

package "Clients" {
  [Web Editor] as Web
  [Desktop App] as Desktop
  [CLI] as CLI
}

package "Services" {
  [API Gateway] as API
  [Render Service] as Render
  [Auth Service] as Auth
  [Export Worker] as Export
}

database "PostgreSQL" as DB
queue "Event Bus" as Bus
cloud "Object Storage" as S3

Web --> API
Desktop --> API
CLI --> API
API --> Auth : verify token
API --> Render : render(source)
Render --> DB : load document
Render --> S3 : cache artifact
Render ..> Bus : render.completed
Bus ..> Export : consume
Export --> S3 : write png / svg
@enduml`,
  },
  {
    id: 'puml-state',
    language: 'plantuml',
    name: '订单状态机',
    description: 'State · 生命周期、超时、退款',
    code: `@startuml
hide empty description
title Order lifecycle

[*] --> Draft
Draft --> Pending : checkout
Pending --> Paid : payment captured
Pending --> Cancelled : 30 min timeout
Paid --> Shipped : fulfill
Shipped --> Delivered : carrier scan
Delivered --> Returned : return request
Cancelled --> [*]
Returned --> Refunded : refund approved
Refunded --> [*]

note right of Paid
  Webhooks are reconciled
  by the nightly worker.
end note
@enduml`,
  },
  {
    id: 'puml-usecase',
    language: 'plantuml',
    name: '产品用例图',
    description: 'Use case · 角色、系统边界',
    code: `@startuml
left to right direction
title UML Live use cases

actor "Developer" as Dev
actor "Team Lead" as Lead

rectangle "UML Live desktop app" {
  usecase "Write PlantUML / Mermaid" as UC1
  usecase "Preview diagram" as UC2
  usecase "Export SVG / PNG" as UC3
  usecase "Copy image" as UC4
  usecase "Open local source" as UC5
  usecase "Manage templates" as UC6
}

Dev --> UC1
Dev --> UC2
Dev --> UC3
Dev --> UC4
Dev --> UC5
Lead --> UC6
@enduml`,
  },

  // ----------------------------------------------------------------- Mermaid
  {
    id: 'mmd-flowchart',
    language: 'mermaid',
    name: '发布流水线',
    description: 'Flowchart · 分支、判断、节点',
    code: `flowchart TD
  A([Commit]) --> B{Lint + format}
  B -- pass --> C[Build image]
  B -- fail --> X[Notify author]
  C --> D{Tests}
  D -- pass --> E[Deploy to staging]
  D -- fail --> X
  E --> F{Smoke tests}
  F -- pass --> G([Promote to production])
  F -- fail --> H[Rollback]
  H --> X`,
  },
  {
    id: 'mmd-sequence',
    language: 'mermaid',
    name: '登录鉴权流程',
    description: 'Sequence · 自动编号、备注',
    code: `sequenceDiagram
  autonumber
  actor User
  participant Web as Web App
  participant API as API Gateway
  participant Auth as Auth Service
  participant DB as PostgreSQL

  User->>Web: Enter credentials
  Web->>API: POST /auth/login
  API->>Auth: verify(credentials)
  Auth->>DB: SELECT user
  DB-->>Auth: user + password hash
  Auth-->>API: signed JWT
  API-->>Web: 200 { accessToken }
  Web-->>User: Redirect to dashboard

  Note over Auth,DB: Refresh tokens rotate every 30 days`,
  },
  {
    id: 'mmd-class',
    language: 'mermaid',
    name: '内容模型',
    description: 'Class · 属性、方法、枚举',
    code: `classDiagram
  class User {
    +UUID id
    +String email
    +String displayName
    +login(password) bool
  }
  class Workspace {
    +UUID id
    +String name
    +invite(email) void
  }
  class Diagram {
    +UUID id
    +DiagramKind kind
    +String source
    +export(format) Blob
  }
  class DiagramKind {
    <<enumeration>>
    PLANTUML
    MERMAID
  }

  User "1" --> "*" Workspace : owns
  Workspace "1" --> "*" Diagram : contains
  Diagram --> DiagramKind`,
  },
  {
    id: 'mmd-er',
    language: 'mermaid',
    name: '博客数据库',
    description: 'ER · 实体关系、主外键',
    code: `erDiagram
  USER ||--o{ POST : writes
  POST ||--o{ COMMENT : receives
  USER ||--o{ COMMENT : authors
  POST }o--o{ TAG : tagged

  USER {
    uuid id PK
    string email UK
    string display_name
    timestamp created_at
  }
  POST {
    uuid id PK
    uuid author_id FK
    string title
    text body
    string status
  }
  COMMENT {
    uuid id PK
    uuid post_id FK
    uuid author_id FK
    text body
  }
  TAG {
    uuid id PK
    string name UK
  }`,
  },
  {
    id: 'mmd-state',
    language: 'mermaid',
    name: '订阅生命周期',
    description: 'State · 状态迁移、注释',
    code: `stateDiagram-v2
  [*] --> Trial
  Trial --> Active : upgrade
  Trial --> Expired : 14 days
  Active --> PastDue : payment failed
  PastDue --> Active : payment retried
  PastDue --> Cancelled : 7 days overdue
  Active --> Cancelled : cancel plan
  Cancelled --> [*]
  Expired --> [*]

  note right of PastDue
    Retry payment 3 times
    with exponential backoff
  end note`,
  },
  {
    id: 'mmd-gantt',
    language: 'mermaid',
    name: '项目排期',
    description: 'Gantt · 阶段、里程碑',
    code: `gantt
  title Product launch plan
  dateFormat YYYY-MM-DD
  axisFormat %b %d

  section Design
  Discovery           :done,    des1, 2026-11-02, 8d
  Wireframes          :active,  des2, after des1, 7d
  Design system       :         des3, after des2, 10d

  section Build
  Diagram engine      :         dev1, after des3, 14d
  Export pipeline     :         dev2, after dev1, 6d
  Packaging           :         dev3, after dev2, 4d

  section Launch
  Beta                :milestone, m1, after dev2, 0d
  Public release      :milestone, m2, after dev3, 0d`,
  },
];

const byId = new Map(templates.map((template) => [template.id, template]));

export function getTemplate(id) {
  return byId.get(id) ?? null;
}

export function templatesFor(language) {
  return templates.filter((template) => template.language === language);
}

export function defaultTemplate(language) {
  return templatesFor(language)[0] ?? templates[0];
}

const EXTENSION_LANGUAGE = new Map([
  ['puml', 'plantuml'],
  ['plantuml', 'plantuml'],
  ['pu', 'plantuml'],
  ['uml', 'plantuml'],
  ['mmd', 'mermaid'],
  ['mermaid', 'mermaid'],
]);

export function languageFromPath(filePath) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(String(filePath ?? ''));
  if (!match) return null;
  return EXTENSION_LANGUAGE.get(match[1].toLowerCase()) ?? null;
}

const PLANTUML_CONTENT = /^\s*@start[A-Za-z]+|^\s*!theme\b|^\s*skinparam\b|^\s*@enduml/m;
const MERMAID_CONTENT =
  /^\s*(?:---[\s\S]*?---\s*)?(?:graph\s|flowchart\s|sequenceDiagram\b|classDiagram\b|stateDiagram(?:-v2)?\b|erDiagram\b|gantt\b|pie\b|journey\b|gitGraph\b|mindmap\b|timeline\b|quadrantChart\b|requirementDiagram\b|C4\w+\b|sankey(?:-beta)?\b|xychart(?:-beta)?\b|block-beta\b|packet(?:-beta)?\b|architecture-beta\b|kanban\b|radar-beta\b|treemap\b|venn-beta\b|usecase-beta\b|treeView-beta\b|swimlane-beta\b)/m;

export function detectLanguageFromContent(code) {
  const text = String(code ?? '');
  if (PLANTUML_CONTENT.test(text)) return 'plantuml';
  if (MERMAID_CONTENT.test(text)) return 'mermaid';
  return null;
}
