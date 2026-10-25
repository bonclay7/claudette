export interface Customer {
  slug: string;
  name: string;
  contacts: string[]; // email addresses
  language: string; // e.g. "en-US"
  createdAt: string;
}

export interface Request {
  requestId: string;
  slug: string;
  audioKey: string;
  audioFormat: string;
  status: "pending" | "transcribing" | "processing" | "notified" | "failed";
  transcript?: string;
  tasks?: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
}
