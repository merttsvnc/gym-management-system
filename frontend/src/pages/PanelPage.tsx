import {
  IconUsers,
  IconUserCheck,
  IconBuilding,
  IconChartBar,
} from "@tabler/icons-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Mock data - will be replaced with real API calls later
const mockDashboardData = {
  totalMembers: 128,
  activeMembers: 94,
  branchCount: 2,
  maxBranches: 3,
  recentActivities: [
    {
      id: 1,
      title: "Yeni üye kaydı",
      description: "Ali Yılmaz • İstanbul Şubesi",
      timestamp: "5 dk önce",
    },
    {
      id: 2,
      title: "Üyelik yenileme",
      description: "Ayşe Demir • 3 aylık paket",
      timestamp: "2 saat önce",
    },
    {
      id: 3,
      title: "Yeni şube eklendi",
      description: "Test 2 Şubesi • Varsayılan değil",
      timestamp: "Dün",
    },
    {
      id: 4,
      title: "Üyelik iptali",
      description: "Mehmet Kaya • İstanbul Şubesi",
      timestamp: "2 gün önce",
    },
  ],
};

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

function StatCard({ title, value, description, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

export function PanelPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="text-sm text-muted-foreground">
          Salonunuzun genel durumunu ve önemli metrikleri buradan görüntüleyin.
        </p>
      </div>

      {/* Top Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Toplam Üye"
          value={mockDashboardData.totalMembers}
          description="Sisteme kayıtlı toplam üye sayısı"
          icon={IconUsers}
        />
        <StatCard
          title="Aktif Üye"
          value={mockDashboardData.activeMembers}
          description="Aktif üyelik paketi olan üyeler"
          icon={IconUserCheck}
        />
        <StatCard
          title="Şube Sayısı"
          value={mockDashboardData.branchCount}
          description="Sistemde kayıtlı şube sayısı"
          icon={IconBuilding}
        />
        <StatCard
          title="Plan Kullanımı"
          value={`${mockDashboardData.branchCount} / ${mockDashboardData.maxBranches}`}
          description={`Mevcut planınızda en fazla ${mockDashboardData.maxBranches} şube oluşturabilirsiniz`}
          icon={IconChartBar}
        />
      </div>

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <CardTitle>Son Aktiviteler</CardTitle>
          <CardDescription>
            Son eklenen üyeler ve şube hareketleri (mock veri).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {mockDashboardData.recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between border-b border-border last:border-0 pb-3 last:pb-0"
              >
                <div>
                  <p className="font-medium">{activity.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {activity.description}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                  {activity.timestamp}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
