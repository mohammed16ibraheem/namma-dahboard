import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const COMPANIES_FILE = path.join(DATA_DIR, "companies.json");

type Task = {
  description: string;
  responsibleEmployee: string;
  status: "Completed" | "Pending" | "Waiting" | "In Progress";
  timeline?: string;
  remarks?: string;
  fromDate?: string;
  updatedAt?: string;
};

type Report = {
  id: string;
  submittedAt: string;
  submittedBy: string;
  userId: string;
  date: string;
  tasks: Task[];
};

type UserFile = {
  userId: string;
  userName: string;
  company: string;
  companyName: string;
  department: string;
  departmentName: string;
  reports: Report[];            // Category 1 — daily tasks
  managementReports?: Report[]; // Category 2 — management assigned tasks
};

type Category = "daily" | "management";

// Which array on the user file holds a given category
function arrayFor(user: UserFile, category: Category): Report[] {
  if (category === "management") {
    if (!user.managementReports) user.managementReports = [];
    return user.managementReports;
  }
  return user.reports;
}

type Companies = Record<string, {
  name: string;
  departments: Record<string, string>;
}>;

// ── Per-file write lock ──────────────────────────────────
// Serializes read-modify-write on the SAME file so concurrent requests
// for one user can't overwrite each other. Different files (different
// users / departments / companies) get different keys → run in parallel.
const fileLocks = new Map<string, Promise<unknown>>();

function withFileLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = fileLocks.get(key) ?? Promise.resolve();
  const run = prev.then(() => fn(), () => fn());
  fileLocks.set(key, run.catch(() => {}));
  return run;
}

function readCompanies(): Companies {
  return JSON.parse(fs.readFileSync(COMPANIES_FILE, "utf-8"));
}

function deptDir(company: string, department: string) {
  return path.join(DATA_DIR, company, department);
}

function userFile(company: string, department: string, userId: string) {
  return path.join(deptDir(company, department), `${userId}.json`);
}

function readUserFile(company: string, department: string, userId: string): UserFile | null {
  const file = userFile(company, department, userId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeUserFile(data: UserFile) {
  const dir = deptDir(data.company, data.department);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const target = userFile(data.company, data.department, data.userId);
  // Atomic write: write to a temp file then rename, so a concurrent
  // reader never sees a half-written file.
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, target);
}

function listDeptUsers(company: string, department: string): UserFile[] {
  const dir = deptDir(company, department);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as UserFile);
}

// GET /api/reports?company=namma&department=it[&userId=...]
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const company = searchParams.get("company");
  const department = searchParams.get("department");
  const userId = searchParams.get("userId");

  if (!company || !department) {
    return NextResponse.json({ error: "Missing company or department" }, { status: 400 });
  }

  const companies = readCompanies();
  const companyMeta = companies[company];
  const deptName = companyMeta?.departments?.[department];

  if (!companyMeta || !deptName) {
    return NextResponse.json({ reports: [], users: [] });
  }

  // If userId requested, return just that user's file
  if (userId) {
    const file = readUserFile(company, department, userId);
    return NextResponse.json(file ?? { reports: [], users: [] });
  }

  // Otherwise, return all users' reports merged (admin view)
  const users = listDeptUsers(company, department);
  const allReports = users.flatMap((u) => u.reports);
  const allManagementReports = users.flatMap((u) => u.managementReports ?? []);

  return NextResponse.json({
    company,
    companyName: companyMeta.name,
    department,
    departmentName: deptName,
    users: users.map(({ userId, userName }) => ({ userId, userName })),
    reports: allReports,
    managementReports: allManagementReports,
  });
}

// POST /api/reports — save a new report under the user's file
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { company, department, report, category = "daily" } = body as {
    company: string;
    department: string;
    report: Report & { userName?: string };
    category?: Category;
  };

  if (!company || !department || !report?.userId) {
    return NextResponse.json({ error: "Missing fields (company, department, report.userId)" }, { status: 400 });
  }

  const companies = readCompanies();
  const companyMeta = companies[company];
  const deptName = companyMeta?.departments?.[department];
  if (!companyMeta || !deptName) {
    return NextResponse.json({ error: "Company/department not found" }, { status: 404 });
  }

  const key = userFile(company, department, report.userId);

  return withFileLock(key, () => {
    const existing = readUserFile(company, department, report.userId) ?? {
      userId: report.userId,
      userName: report.userName ?? report.submittedBy ?? report.userId,
      company,
      companyName: companyMeta.name,
      department,
      departmentName: deptName,
      reports: [],
      managementReports: [],
    };

    const targetArray = arrayFor(existing, category);

    // Idempotency: if a report with this id already exists, don't add a
    // duplicate (protects against double-click / network retry).
    if (targetArray.some((r) => r.id === report.id)) {
      return NextResponse.json({ success: true, duplicate: true, report });
    }

    targetArray.push({
      id: report.id,
      submittedAt: report.submittedAt,
      submittedBy: report.submittedBy,
      userId: report.userId,
      date: report.date,
      tasks: report.tasks,
    });

    writeUserFile(existing);
    return NextResponse.json({ success: true, report });
  });
}

// PUT /api/reports — update a task inside an existing report
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { company, department, userId, reportId, taskIndex, taskUpdate, category = "daily" } = body as {
    company: string;
    department: string;
    userId?: string;
    reportId: string;
    taskIndex: number;
    taskUpdate: Partial<Task>;
    category?: Category;
  };

  if (!company || !department || !reportId || taskIndex === undefined || !taskUpdate) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Determine which user file(s) to search/update
  const targetUsers: string[] = userId
    ? [userId]
    : listDeptUsers(company, department).map((u) => u.userId);

  // Lock each candidate file in turn; update inside the lock so a
  // concurrent POST/PUT on the same file can't clobber the change.
  for (const uid of targetUsers) {
    const key = userFile(company, department, uid);
    const result = await withFileLock(key, () => {
      const user = readUserFile(company, department, uid);
      if (!user) return null;
      const arr = arrayFor(user, category);
      const rIdx = arr.findIndex((r) => r.id === reportId);
      if (rIdx === -1) return null;
      arr[rIdx].tasks[taskIndex] = {
        ...arr[rIdx].tasks[taskIndex],
        ...taskUpdate,
      };
      writeUserFile(user);
      return true;
    });
    if (result) return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Report not found" }, { status: 404 });
}
