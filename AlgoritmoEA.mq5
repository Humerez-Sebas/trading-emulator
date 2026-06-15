//+------------------------------------------------------------------+
//|                                                   AlgoritmoEA.mq5 |
//|                          Estrategia "Algoritmo" - Patron de velas |
//|                                          v1 - XAUUSD H1 (24 horas) |
//+------------------------------------------------------------------+
//| LOGICA DEL PATRON:                                               |
//|  1) TECHO  : vela alcista seguida (adyacente) de una bajista.    |
//|              Nivel = max(cierre_alcista, apertura_bajista).      |
//|              El gap entre ambas no puede superar InpMaxGapPips.  |
//|  2) QUIEBRE: una vela ALCISTA cuyo CUERPO atraviesa el techo:    |
//|              apertura <= techo  Y  cierre > techo.              |
//|              (si abre por encima del techo = gap, NO es valido)  |
//|  3) CONTINUACION (vela siguiente al quiebre):                   |
//|              high > high_quiebre  Y  low >= low_quiebre.         |
//|              Puede ser alcista o bajista. Si falla, el techo     |
//|              queda invalidado.                                  |
//|  ENTRADA : BuyLimit en el low de la vela de continuacion.       |
//|  SL      : low de la vela de quiebre.                           |
//|  TP      : 1:1  ->  entrada + (entrada - SL).                   |
//|  RIESGO  : InpRiskPercent % del balance por operacion.          |
//|                                                                  |
//| Al iniciar realiza un ESCANEO de InpInitScanBars velas para     |
//| reconstruir techos vigentes y reponer ordenes aun validas.      |
//+------------------------------------------------------------------+
#property copyright "Algoritmo EA"
#property version   "1.10"
#property strict

#include <Trade\Trade.mqh>

//--- Inputs -----------------------------------------------------------------
input ENUM_TIMEFRAMES InpTF             = PERIOD_H1; // Temporalidad de trabajo
input double          InpRiskPercent    = 1.0;       // Riesgo por operacion (% del balance)
input double          InpTakeProfitRR   = 2.0;       // Ratio Riesgo:Beneficio (TP)
input double          InpMaxGapPips     = 5.0;       // Gap maximo del techo (en pips)
input double          InpPipInPoints    = 10;        // Cuantos 'points' equivalen a 1 pip
input int             InpTechoMaxBars   = 100;       // Velas que un techo permanece valido
input int             InpOrderExpiryBars= 50;        // Velas hasta cancelar la orden pendiente
input int             InpMaxTrades      = 3;         // Maximo de operaciones simultaneas
input int             InpMinSizePoints  = 300;       // Tamano minimo del algoritmo (entrada-SL) en puntos
input int             InpInitScanBars   = 100;       // Velas a escanear al iniciar (historico)
input long            InpMagic          = 990011;    // Magic number
input bool            InpShowObjects    = true;      // Dibujar techos y zonas en el grafico
input bool            InpDebugLog       = true;      // Escribir decisiones a algoritmo_debug.csv (carpeta comun)

//--- Estados de un techo ----------------------------------------------------
#define ST_ACTIVE  0   // esperando quiebre
#define ST_BROKEN  1   // quiebre ocurrido, esperando vela de continuacion

struct STecho
  {
   double   level;       // nivel del techo
   datetime formTime;    // hora de la vela bajista que lo formo
   int      state;       // ST_ACTIVE / ST_BROKEN
   double   qHigh;       // high de la vela de quiebre
   double   qLow;        // low  de la vela de quiebre
   datetime qTime;       // hora de la vela de quiebre
  };

//--- Zona dibujada vinculada a una orden/posicion (para limpiarla al cerrar)
struct SZone
  {
   ulong    ticket;      // ticket de la orden pendiente / posicion
   string   zoneName;    // nombre del rectangulo de la zona
   string   techoName;   // nombre de la linea del techo asociado
  };

STecho   g_techos[];        // lista de techos activos
SZone    g_zones[];         // zonas dibujadas con orden asociada
CTrade   g_trade;           // objeto de trading
datetime g_lastBar = 0;     // control de vela nueva
bool     g_initScanned=false; // ya se hizo el escaneo historico?
int      g_dbg = INVALID_HANDLE; // handle del CSV de depuracion

//+------------------------------------------------------------------+
//| Log estructurado: consola + CSV (carpeta comun de MetaQuotes)    |
//+------------------------------------------------------------------+
void Dbg(string evento,datetime barTime,double p1=0,double p2=0,string detalle="")
  {
   PrintFormat("[%s] %s p1=%.2f p2=%.2f %s",evento,TimeToString(barTime,TIME_DATE|TIME_MINUTES),p1,p2,detalle);
   if(g_dbg==INVALID_HANDLE)
      return;
   FileWrite(g_dbg,TimeToString(barTime,TIME_DATE|TIME_MINUTES),evento,
             DoubleToString(p1,_Digits),DoubleToString(p2,_Digits),detalle);
   FileFlush(g_dbg);
  }

//+------------------------------------------------------------------+
//| Inicializacion                                                   |
//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetMarginMode();
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetDeviationInPoints(10);

   ArrayResize(g_techos,0);
   ArrayResize(g_zones,0);
   g_lastBar      = 0;
   g_initScanned  = false;

   if(InpDebugLog)
     {
      g_dbg=FileOpen("algoritmo_debug.csv",FILE_WRITE|FILE_CSV|FILE_COMMON|FILE_ANSI,',');
      if(g_dbg!=INVALID_HANDLE)
         FileWrite(g_dbg,"bar_time","evento","p1","p2","detalle");
      else
         Print("Aviso: no se pudo crear algoritmo_debug.csv");
     }

   PrintFormat("AlgoritmoEA v1.30 iniciado en %s / %s",_Symbol,EnumToString(InpTF));
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
//| Desinicializacion                                                |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(InpShowObjects)
      ObjectsDeleteAll(0,"ALG_");
   if(g_dbg!=INVALID_HANDLE)
     {
      FileClose(g_dbg);
      g_dbg=INVALID_HANDLE;
     }
  }

//+------------------------------------------------------------------+
//| OnTick                                                           |
//+------------------------------------------------------------------+
void OnTick()
  {
   //--- escaneo historico la primera vez (en OnTick, no en OnInit,
   //--- para poder colocar ordenes con seguridad tambien en el tester)
   if(!g_initScanned)
     {
      InitialScan();
      g_initScanned = true;
      g_lastBar     = iTime(_Symbol,InpTF,0);
      return;
     }

   datetime t = iTime(_Symbol,InpTF,0);
   if(t==g_lastBar)
      return;            // todavia es la misma vela
   g_lastBar = t;
   ProcessBar(1,true);   // se acaba de cerrar la vela en shift 1
   CleanupZones();       // borra zonas cuyo trade ya termino (cerro/cancelo/expiro)
   ChartRedraw(0);
  }

//+------------------------------------------------------------------+
//| Escaneo historico: reconstruye techos y repone ordenes vigentes  |
//+------------------------------------------------------------------+
void InitialScan()
  {
   int total = Bars(_Symbol,InpTF);
   if(total < 5)
      return;

   int start = MathMin(InpInitScanBars, total-3); // shift mas antiguo a procesar
   PrintFormat("Escaneo historico: %d velas...",start);

   //--- procesamos de la vela mas antigua a la mas reciente (orden cronologico)
   for(int sh=start; sh>=1; sh--)
      ProcessBar(sh,true);

   CleanupZones();
   ChartRedraw(0);
   PrintFormat("Escaneo historico finalizado. Techos vigentes: %d",ArraySize(g_techos));
  }

//+------------------------------------------------------------------+
//| Logica del patron aplicada a la vela 'shift' (recien cerrada)    |
//|   s1 = shift     (vela cerrada que evaluamos)                    |
//|   s2 = shift+1   (vela anterior)                                 |
//|   allowTrade: si false, solo reconstruye estado (sin operar)     |
//+------------------------------------------------------------------+
void ProcessBar(int shift,bool allowTrade)
  {
   int s1 = shift;
   int s2 = shift+1;
   if(s2 >= Bars(_Symbol,InpTF))
      return;

   //--- OHLC de la vela evaluada (s1)
   double o1=iOpen (_Symbol,InpTF,s1), h1=iHigh(_Symbol,InpTF,s1);
   double l1=iLow  (_Symbol,InpTF,s1), c1=iClose(_Symbol,InpTF,s1);
   datetime tm1=iTime(_Symbol,InpTF,s1);

   //--- OHLC de la vela anterior (s2)
   double o2=iOpen (_Symbol,InpTF,s2), c2=iClose(_Symbol,InpTF,s2);
   datetime tm2=iTime(_Symbol,InpTF,s2);

   //=== PASO 1: resolver CONTINUACIONES (techos rotos en la vela previa) ====
   //--- Una misma vela de quiebre puede haber roto VARIOS techos: eso cuenta
   //--- como UN solo algoritmo (entrada/SL dependen de las velas de quiebre y
   //--- continuacion, no del nivel del techo). Elegimos un techo representante
   //--- (el de mayor nivel) que coloca la unica orden; los demas se consumen.
   int    repIdx   = -1;
   double repLevel = -1.0;
   for(int i=0; i<ArraySize(g_techos); i++)
      if(g_techos[i].state==ST_BROKEN && g_techos[i].qTime==tm2 && g_techos[i].level>repLevel)
        {
         repLevel = g_techos[i].level;
         repIdx   = i;
        }

   for(int i=ArraySize(g_techos)-1; i>=0; i--)
     {
      if(g_techos[i].state!=ST_BROKEN)
         continue;

      bool keepLine=false;
      if(i==repIdx)                           // techo representante del algoritmo
        {
         bool superaMax = (h1 > g_techos[i].qHigh);
         bool mechaOk   = (l1 >= g_techos[i].qLow);
         if(superaMax && mechaOk)
           {
            double entry = l1;                 // low de la continuacion
            double sl    = g_techos[i].qLow;   // low del quiebre
            Dbg("ALGORITMO_VALIDO",tm1,entry,sl,StringFormat("techo=%.2f",g_techos[i].level));
            //--- si se coloca la orden, la linea del techo se conserva (ligada a la zona)
            keepLine=TryPlaceOrder(entry,sl,s1,g_techos[i].formTime,g_techos[i].qTime,tm1,allowTrade);
           }
         else
            Dbg("CONT_FALLIDA",tm1,g_techos[i].level,0,
                StringFormat("h1=%.2f vs qHigh=%.2f | l1=%.2f vs qLow=%.2f",h1,g_techos[i].qHigh,l1,g_techos[i].qLow));
        }

      //--- techos no representantes (mismo quiebre = mismo algoritmo) o rep sin
      //--- orden: se limpia su linea. Solo la del rep con orden se conserva.
      if(!keepLine)
         DeleteTechoLine(g_techos[i].formTime);
      RemoveTecho(i);
     }

   //=== PASO 2: detectar QUIEBRES sobre techos ACTIVOS =====================
   //--- Quiebre valido = vela ALCISTA cuyo CUERPO atraviesa el techo:
   //---    abre <= techo  Y  cierra > techo.
   //--- NO es valido si:
   //---    * abre por encima del techo (gap por encima del nivel), o
   //---    * la apertura llega tras un GAP grande respecto al cierre previo
   //---      (el cruce lo logro el gap, no precio negociado).
   //--- En ambos casos el techo SIGUE ACTIVO para un quiebre real posterior.
   bool   c1Bull  = (c1>o1);
   double maxGap  = InpMaxGapPips*InpPipInPoints*_Point;
   double openGap = o1 - c2;          // gap (hacia arriba) al abrir la vela actual
   for(int i=0; i<ArraySize(g_techos); i++)
     {
      if(g_techos[i].state!=ST_ACTIVE)
         continue;
      double level=g_techos[i].level;
      if(!(c1Bull && o1<=level && c1>level))
         continue;                    // no cruza el techo con cuerpo alcista

      if(openGap > maxGap)
        {
         //--- el cruce se logro por un gap de apertura -> quiebre NO valido
         Dbg("QUIEBRE_GAP_IGNORADO",tm1,level,openGap,StringFormat("O=%.2f C=%.2f maxGap=%.2f",o1,c1,maxGap));
         continue;
        }

      g_techos[i].state = ST_BROKEN;
      g_techos[i].qHigh = h1;
      g_techos[i].qLow  = l1;
      g_techos[i].qTime = tm1;
      //--- la linea del techo se recorta para terminar en la vela de quiebre
      TrimTechoLine(g_techos[i].formTime,tm1,level);
      Dbg("QUIEBRE",tm1,level,0,StringFormat("O=%.2f C=%.2f gapApertura=%.2f",o1,c1,openGap));
     }

   //=== PASO 3: detectar nuevo TECHO (s2 alcista + s1 bajista) =============
   bool c2Bull = (c2>o2);
   bool c1Bear = (c1<o1);
   if(c2Bull && c1Bear)
     {
      double gapPrice = MathAbs(c2 - o1);                 // gap cierre_alcista vs apertura_bajista
      double maxGap   = InpMaxGapPips*InpPipInPoints*_Point;
      if(gapPrice<=maxGap)
        {
         STecho t;
         t.level    = MathMax(c2,o1);
         t.formTime = tm1;
         t.state    = ST_ACTIVE;
         t.qHigh=0; t.qLow=0; t.qTime=0;
         AddTecho(t);
         DrawTecho(t);
         Dbg("NUEVO_TECHO",tm1,t.level,gapPrice);
        }
     }

   //=== PASO 4: invalidar techos ACTIVOS (gap que los sobrepasa) y caducar ==
   int secs = PeriodSeconds(InpTF);
   for(int i=ArraySize(g_techos)-1; i>=0; i--)
     {
      if(g_techos[i].state!=ST_ACTIVE)
         continue;
      double level=g_techos[i].level;

      //--- la vela ABRIO por encima del techo: el precio lo sobrepaso de un
      //--- salto (gap), sin un quiebre limpio -> el techo deja de ser valido.
      //--- (no aplica al techo recien creado en este mismo bar: su level>=o1)
      if(o1 > level)
        {
         Dbg("TECHO_INVALIDADO_GAP",tm1,level,o1);
         DeleteTechoLine(g_techos[i].formTime);
         RemoveTecho(i);
         continue;
        }

      //--- caducidad por antiguedad
      int ageBars = (int)((tm1 - g_techos[i].formTime)/secs);
      if(ageBars > InpTechoMaxBars)
        {
         Dbg("TECHO_CADUCADO",tm1,level,ageBars);
         DeleteTechoLine(g_techos[i].formTime);   // caducado: limpiar su linea
         RemoveTecho(i);
        }
     }
  }

//+------------------------------------------------------------------+
//| Intentar colocar la orden BuyLimit con gestion de riesgo         |
//|   contShift : shift de la vela de continuacion (para validar     |
//|               si la entrada ya fue tocada y si la orden expiro)   |
//|   formTime  : hora del techo (para vincular su linea a la zona)   |
//|   Devuelve true si la orden se coloco correctamente.             |
//+------------------------------------------------------------------+
bool TryPlaceOrder(double entry,double sl,int contShift,datetime formTime,datetime qTime,datetime contTime,bool allowTrade)
  {
   if(!allowTrade)
      return(false);

   //--- vencimiento basado en la vela de continuacion (vale para historico y live)
   datetime expiry = contTime + (datetime)(InpOrderExpiryBars*PeriodSeconds(InpTF));
   if(expiry <= TimeCurrent())
     {
      Dbg("OMITIDO_EXPIRADO",contTime,entry,sl);
      return(false);
     }

   //--- si entre la continuacion y ahora el precio ya toco la entrada,
   //--- la orden ya se habria ejecutado en su momento -> no la reponemos
   for(int sh=contShift-1; sh>=1; sh--)
     {
      if(iLow(_Symbol,InpTF,sh) <= entry)
        {
         Dbg("OMITIDO_YA_TOCADA",contTime,entry,iLow(_Symbol,InpTF,sh),
             TimeToString(iTime(_Symbol,InpTF,sh),TIME_DATE|TIME_MINUTES));
         return(false);
        }
     }

   //--- limite de operaciones simultaneas
   if(CountActive() >= InpMaxTrades)
     {
      Dbg("OMITIDO_MAX_TRADES",contTime,CountActive(),InpMaxTrades);
      return(false);
     }

   double risk = entry - sl;
   if(risk <= 0)
     {
      Dbg("OMITIDO_RIESGO_NEG",contTime,entry,sl);
      return(false);
     }

   //--- filtro de tamano minimo del algoritmo (altura de la zona)
   double minSize = InpMinSizePoints*_Point;
   if(risk < minSize)
     {
      Dbg("OMITIDO_MUY_PEQUENO",contTime,risk/_Point,InpMinSizePoints);
      return(false);
     }

   //--- distancia minima permitida por el broker (stops level)
   double stopLevel = (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL)*_Point;
   double ask = SymbolInfoDouble(_Symbol,SYMBOL_ASK);
   if(entry >= ask - stopLevel)
     {
      Dbg("OMITIDO_PRECIO_CERCA",contTime,entry,ask);
      return(false);
     }
   if(risk < stopLevel)
     {
      Dbg("OMITIDO_STOPS_LEVEL",contTime,risk,stopLevel);
      return(false);
     }

   double tp = entry + risk*InpTakeProfitRR;

   entry = NormalizeDouble(entry,_Digits);
   sl    = NormalizeDouble(sl,_Digits);
   tp    = NormalizeDouble(tp,_Digits);

   double lots = CalcLots(entry,sl);
   if(lots<=0)
     {
      Print("Senal omitida: lotaje calculado = 0");
      return(false);
     }

   string comment = "Algoritmo";
   if(g_trade.BuyLimit(lots,entry,_Symbol,sl,tp,ORDER_TIME_SPECIFIED,expiry,comment))
     {
      Dbg("ORDEN_COLOCADA",contTime,entry,sl,StringFormat("lots=%.2f tp=%.2f",lots,tp));
      string zName = DrawZone(qTime,contTime,sl,entry);
      string tName = TechoName(formTime);
      RegisterZone(g_trade.ResultOrder(),zName,tName);
      return(true);
     }
   Dbg("ERROR_ORDEN",contTime,entry,sl,StringFormat("ret=%d %s",
       g_trade.ResultRetcode(),g_trade.ResultRetcodeDescription()));
   return(false);
  }

//+------------------------------------------------------------------+
//| Calcular lotaje para arriesgar InpRiskPercent% del balance       |
//|   Usa OrderCalcProfit: contempla tamano de contrato y divisa     |
//+------------------------------------------------------------------+
double CalcLots(double entry,double sl)
  {
   if(entry<=sl)
      return(0.0);

   double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE)*InpRiskPercent/100.0;

   //--- perdida en dinero de 1 lote si el precio va de entry -> sl (compra)
   double lossPerLot=0.0;
   if(!OrderCalcProfit(ORDER_TYPE_BUY,_Symbol,1.0,entry,sl,lossPerLot))
     {
      PrintFormat("OrderCalcProfit fallo (err %d)",GetLastError());
      return(0.0);
     }
   lossPerLot = MathAbs(lossPerLot);   // sl<entry => profit negativo
   if(lossPerLot<=0)
      return(0.0);

   double lots = riskMoney/lossPerLot;

   //--- normalizar al step y limites del simbolo
   double minLot = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);

   lots = MathFloor(lots/step)*step;     // redondear hacia abajo (no exceder el riesgo)

   if(lots<minLot)
     {
      PrintFormat("Aviso: lotaje minimo (%.2f) implica un riesgo MAYOR al %.1f%% objetivo",
                  minLot,InpRiskPercent);
      lots=minLot;
     }
   if(lots>maxLot)
      lots=maxLot;

   return(lots);
  }

//+------------------------------------------------------------------+
//| Contar operaciones activas (ordenes pendientes + posiciones)     |
//+------------------------------------------------------------------+
int CountActive()
  {
   int n=0;
   for(int i=PositionsTotal()-1; i>=0; i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)==InpMagic &&
         PositionGetString(POSITION_SYMBOL)==_Symbol)
         n++;
     }
   for(int i=OrdersTotal()-1; i>=0; i--)
     {
      ulong tk=OrderGetTicket(i);
      if(tk==0) continue;
      if(OrderGetInteger(ORDER_MAGIC)==InpMagic &&
         OrderGetString(ORDER_SYMBOL)==_Symbol)
         n++;
     }
   return(n);
  }

//+------------------------------------------------------------------+
//| Manejo de la lista de techos                                     |
//+------------------------------------------------------------------+
void AddTecho(STecho &t)
  {
   int n=ArraySize(g_techos);
   ArrayResize(g_techos,n+1);
   g_techos[n]=t;
  }

void RemoveTecho(int idx)
  {
   int n=ArraySize(g_techos);
   if(idx<0 || idx>=n) return;
   //--- NOTA: la linea del grafico se gestiona aparte (DeleteTechoLine / zona)
   for(int i=idx; i<n-1; i++)
      g_techos[i]=g_techos[i+1];
   ArrayResize(g_techos,n-1);
  }

//+------------------------------------------------------------------+
//| Registro de zonas y limpieza por estado del ticket               |
//+------------------------------------------------------------------+
void RegisterZone(ulong ticket,string zoneName,string techoName)
  {
   int n=ArraySize(g_zones);
   ArrayResize(g_zones,n+1);
   g_zones[n].ticket    = ticket;
   g_zones[n].zoneName  = zoneName;
   g_zones[n].techoName = techoName;
  }

//--- borra la zona (y su linea de techo) cuando el trade ya no existe:
//--- orden ejecutada y cerrada (TP/SL), cancelada o expirada.
void CleanupZones()
  {
   for(int i=ArraySize(g_zones)-1; i>=0; i--)
     {
      ulong tk=g_zones[i].ticket;
      bool pendiente = OrderSelect(tk);            // sigue como orden pendiente?
      bool abierta   = PositionSelectByTicket(tk); // sigue como posicion abierta?
      if(!pendiente && !abierta)
        {
         if(InpShowObjects)
           {
            ObjectDelete(0,g_zones[i].zoneName);
            ObjectDelete(0,g_zones[i].techoName);
           }
         //--- quitar del array
         int n=ArraySize(g_zones);
         for(int j=i; j<n-1; j++)
            g_zones[j]=g_zones[j+1];
         ArrayResize(g_zones,n-1);
        }
     }
  }

//+------------------------------------------------------------------+
//| Dibujo (opcional)                                                |
//+------------------------------------------------------------------+
string TechoName(datetime formTime)
  {
   return("ALG_techo_"+IntegerToString((int)formTime));
  }

//--- linea del techo: horizontal, punteada, extendida a la derecha
void DrawTecho(STecho &t)
  {
   if(!InpShowObjects) return;
   string name=TechoName(t.formTime);
   datetime t2=t.formTime+(datetime)(InpTechoMaxBars*PeriodSeconds(InpTF));
   ObjectCreate(0,name,OBJ_TREND,0,t.formTime,t.level,t2,t.level);
   ObjectSetInteger(0,name,OBJPROP_COLOR,clrSilver);
   ObjectSetInteger(0,name,OBJPROP_STYLE,STYLE_DOT);
   ObjectSetInteger(0,name,OBJPROP_WIDTH,1);
   ObjectSetInteger(0,name,OBJPROP_RAY_RIGHT,true);   // se proyecta mientras el techo siga vivo
  }

//--- recorta la linea para que termine justo en la vela de quiebre
void TrimTechoLine(datetime formTime,datetime qTime,double level)
  {
   if(!InpShowObjects) return;
   string name=TechoName(formTime);
   if(ObjectFind(0,name)<0) return;
   ObjectSetInteger(0,name,OBJPROP_RAY_RIGHT,false);
   ObjectSetInteger(0,name,OBJPROP_TIME,1,qTime);
   ObjectSetDouble (0,name,OBJPROP_PRICE,1,level);
   ObjectSetInteger(0,name,OBJPROP_COLOR,clrGold);    // resaltar el techo que se rompio
  }

void DeleteTechoLine(datetime formTime)
  {
   if(!InpShowObjects) return;
   ObjectDelete(0,TechoName(formTime));
  }

//--- dibuja la zona del algoritmo y devuelve su nombre
string DrawZone(datetime qTime,datetime contTime,double low,double high)
  {
   string name="ALG_zona_"+IntegerToString((int)contTime);
   if(!InpShowObjects) return(name);
   datetime tEnd=contTime+(datetime)(InpOrderExpiryBars*PeriodSeconds(InpTF));
   ObjectCreate(0,name,OBJ_RECTANGLE,0,contTime,high,tEnd,low);
   ObjectSetInteger(0,name,OBJPROP_COLOR,clrRoyalBlue);
   ObjectSetInteger(0,name,OBJPROP_FILL,true);
   ObjectSetInteger(0,name,OBJPROP_BACK,true);
   return(name);
  }
//+------------------------------------------------------------------+
