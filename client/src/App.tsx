import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppBackground } from "./components/AppBackground";
import { ThemeProvider } from "./contexts/ThemeContext";
import EnvironmentSelector from "./pages/EnvironmentSelector";
import Home from "./pages/Home";
import Tenants from "./pages/Tenants";
import Products from "./pages/Products";
import Locations from "./pages/Locations";
import Receiving from "./pages/Receiving";
import Picking from "./pages/Picking";
import PickingOrders from "./pages/PickingOrders";
import PickingExecution from "./pages/PickingExecution";
import Shipping from "./pages/Shipping";
import WaveExecution from "./pages/WaveExecution";
import Inventory from "./pages/Inventory";
import Cadastros from "./pages/Cadastros";
import Users from "./pages/Users";
import Roles from "./pages/Roles";
import NFEImport from "./pages/NFEImport";
import InventoryImport from "./pages/InventoryImport";
import StockPositions from "./pages/StockPositions";
import StockMovements from "./pages/StockMovements";
import OccupancyDashboard from "./pages/OccupancyDashboard";
import StageCheck from "./pages/StageCheck";
import ScannerTest from "./pages/ScannerTest";
import PrintSettings from "./pages/PrintSettings";
import Reports from "./pages/Reports";
import Maintenance from "./pages/Maintenance";
import { CollectorHome } from "./pages/collector/CollectorHome";
import { CollectorReceiving } from "./pages/collector/CollectorReceiving";
import { CollectorPicking } from "./pages/collector/CollectorPicking";
import { CollectorStage } from "./pages/collector/CollectorStage";
import { CollectorMovement } from "./pages/collector/CollectorMovement";
import { CollectorLabelReprint } from "./pages/collector/CollectorLabelReprint";
import { ClientPortalLogin } from "@/pages/client/ClientPortalLogin";
import { ClientPortalFirstAccess } from "@/pages/client/ClientPortalFirstAccess";
import { ClientPortalDashboard } from "@/pages/client/ClientPortalDashboard";
import { ClientPortalStock } from "@/pages/client/ClientPortalStock";
import { ClientPortalOrders, ClientPortalOrderDetail } from "@/pages/client/ClientPortalOrders";
import ClientPortalNewOrder from "@/pages/portal/ClientPortalNewOrder";
import {
  ClientPortalReceivings,
  ClientPortalReceivingDetail,
  ClientPortalMovements,
} from "@/pages/client/ClientPortalReceivings";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={EnvironmentSelector} />
      <Route path={"/home"} component={Home} />
      <Route path={"/tenants"} component={Tenants} />
      <Route path={"/products"} component={Products} />
      <Route path={"/locations"} component={Locations} />
      <Route path={"/receiving"} component={Receiving} />
      <Route path={"/recebimento"} component={Receiving} />
      <Route path={"/picking"} component={PickingOrders} />
      <Route path={"/picking/:id"} component={PickingExecution} />
      <Route path={"/picking/execute/:id"} component={WaveExecution} />
      <Route path={"/shipping"} component={Shipping} />
      <Route path={"/separacao"} component={Picking} />
      <Route path={"/inventory"} component={Inventory} />
      <Route path={"/cadastros"} component={Cadastros} />
      <Route path={"/cadastros/produtos"} component={Products} />
      <Route path={"/users"} component={Users} />
      <Route path={"/roles"} component={Roles} />
      <Route path={"/nfe-import"} component={NFEImport} />
      <Route path={"/inventory-import"} component={InventoryImport} />
      <Route path={"/stock"} component={StockPositions} />
      <Route path={"/stock/movements"} component={StockMovements} />
      <Route path={"/stock/occupancy"} component={OccupancyDashboard} />
      <Route path={"/stage/check"} component={StageCheck} />
      <Route path={"/scanner-test"} component={ScannerTest} />
      <Route path={"/settings/printing"} component={PrintSettings} />
      <Route path={"/reports"} component={Reports} />
      <Route path={"/maintenance"} component={Maintenance} />
      <Route path={"/admin"} component={Maintenance} />
        <Route path="/collector" component={CollectorHome} />
        <Route path="/collector/receiving" component={CollectorReceiving} />
        <Route path="/collector/picking" component={CollectorPicking} />
        <Route path="/collector/stage" component={CollectorStage} />
        <Route path="/collector/movement" component={CollectorMovement} />
        <Route path="/collector/label-reprint" component={CollectorLabelReprint} />
      
      {/* Portal do Cliente */}
      <Route path="/portal/login" component={ClientPortalLogin} />
      <Route path="/portal/primeiro-acesso" component={ClientPortalFirstAccess} />
      <Route path="/portal/pedidos/novo" component={ClientPortalNewOrder} />
      <Route path="/portal/pedidos/:id" component={ClientPortalOrderDetail} />
      <Route path="/portal/pedidos" component={ClientPortalOrders} />
      <Route path="/portal/recebimentos/:id" component={ClientPortalReceivingDetail} />
      <Route path="/portal/recebimentos" component={ClientPortalReceivings} />
      <Route path="/portal/movimentacoes" component={ClientPortalMovements} />
      <Route path="/portal/estoque" component={ClientPortalStock} />
      <Route path="/portal" component={ClientPortalDashboard} />
      
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AppBackground>
            <Router />
          </AppBackground>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
