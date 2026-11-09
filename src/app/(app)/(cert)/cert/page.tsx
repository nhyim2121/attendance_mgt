import Soon from "@/components/Soon";
import { requireUser } from "@/lib/auth";

export default async function Page() {
  await requireUser();
  return <Soon k="cert" />;
}
