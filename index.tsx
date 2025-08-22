import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from '@google/genai';

// --- TYPES --- //
interface FlightLeg {
  from: string;
  to: string;
  airline: string;
  departure: string; // Expected format: "YYYY-MM-DD HH:mm"
  arrival: string;   // Expected format: "YYYY-MM-DD HH:mm"
  price: number;
}

interface HotelStay {
  city: string;
  name: string;
  days: number;
  pricePerNight: number;
  checkInDate: string; // Expected format: "YYYY-MM-DD"
}

interface TripResults {
  flights: FlightLeg[];
  accommodations: HotelStay[];
}

interface StoredSearch {
  timestamp: string;
  totalFlightPrice: number;
  results: TripResults;
}

interface PriceHistoryPoint {
    date: string;
    price: number;
    change: number | null;
}


// --- LOCALIZATION --- //
const translations = {
    title: "Escapadas Europeias do Ernest",
    subtitle: "Seu Monitor Pessoal de Passagens e Hospedagem",
    departureLabel: "Data de Partida",
    returnLabel: "Data de Retorno",
    passengersLabel: "Passageiros",
    adultsLabel: "Adultos",
    childrenLabel: "Crianças",
    searchButton: "Encontre Sua Viagem",
    searchingButton: "Buscando...",
    loadingText: "Nossos especialistas estão encontrando as melhores ofertas para você...",
    totalFlightCost: "Custo Total Estimado dos Voos",
    flightItinerary: "✈️ Roteiro de Voo",
    accommodation: "🏨 Hospedagem",
    depart: "Partida",
    arrive: "Chegada",
    days: "Dias",
    checkIn: "Check-in",
    priceVariationChart: "Variação de Preços (Últimas 7 Buscas)",
    tooltipOn: "em",
    emailPreviewTitle: "📧 Prévia do Resumo por E-mail",
    whatsappPreviewTitle: "📱 Prévia do Resumo por WhatsApp",
    sendEmailButton: "Enviar Resumo por E-mail",
    sendWhatsAppButton: "Enviar via WhatsApp",
    viewFlight: "Ver Voo",
    viewHotel: "Ver Hotel",
    exportButton: "Exportar Histórico (Excel)",
    errorDefault: "Falha ao buscar opções de viagem. Por favor, tente novamente mais tarde.",
    chartTableDate: "Data",
    chartTablePrice: "Preço",
    chartTableVariation: "Variação",
};


// --- API & MOCK DATA --- //
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

const getTripData = async (
    departureDate: string,
    returnDate: string,
    adults: number,
    children: number
): Promise<TripResults> => {
  const diffTime = Math.abs(new Date(returnDate).getTime() - new Date(departureDate).getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const prompt = `
    Simule opções de viagem econômicas para uma viagem à Europa para ${adults} adulto(s) e ${children} criança(s).
    A viagem começa em São Paulo (GRU) e termina em São Paulo (GRU).
    A data de partida de São Paulo é ${departureDate} e a data de retorno é ${returnDate}, totalizando ${diffDays} dias de viagem.
    A rota é: São Paulo -> Portugal (LIS) -> Paris (CDG) -> Londres (LHR) -> São Paulo (GRU).
    - O primeiro voo (GRU para LIS) deve ser direto.
    - Distribua os dias de hospedagem entre Portugal, Paris e Londres de forma proporcional dentro do período da viagem (por exemplo, para uma viagem de 11 dias, poderia ser 4 dias em Portugal, 4 em Paris, 3 em Londres).
    - Para cada trecho de voo, o campo 'departure' e 'arrival' deve incluir a data completa no formato 'YYYY-MM-DD HH:mm'.
    - Para cada estadia em hotel, forneça uma data de check-in no formato 'YYYY-MM-DD'.
    Gere horários de voos, companhias aéreas e preços realistas em BRL (Reais Brasileiros) para o número total de passageiros.
    Gere nomes de hotéis e preços realistas em BRL (Reais Brasileiros) para acomodar o grupo.
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      flights: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            from: { type: Type.STRING },
            to: { type: Type.STRING },
            airline: { type: Type.STRING },
            departure: { type: Type.STRING },
            arrival: { type: Type.STRING },
            price: { type: Type.NUMBER },
          },
          required: ["from", "to", "airline", "departure", "arrival", "price"],
        },
      },
      accommodations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            city: { type: Type.STRING },
            name: { type: Type.STRING },
            days: { type: Type.INTEGER },
            pricePerNight: { type: Type.NUMBER },
            checkInDate: { type: Type.STRING },
          },
          required: ["city", "name", "days", "pricePerNight", "checkInDate"],
        },
      },
    },
    required: ["flights", "accommodations"],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });
    
    const jsonText = response.text.trim();
    return JSON.parse(jsonText) as TripResults;

  } catch (error) {
    console.error("Error fetching trip data from AI:", error);
    throw new Error(translations.errorDefault);
  }
};

const getEmailSummary = async (results: TripResults, previousPrice: number | null): Promise<string> => {
    const totalFlightCost = results.flights.reduce((sum, leg) => sum + leg.price, 0);
    
    let priceAnalysisPrompt = "Esta é a primeira vez que buscamos esta viagem, então usaremos este preço como nossa referência para o futuro!";
    if (previousPrice) {
        const difference = totalFlightCost - previousPrice;
        if (difference > 0) {
            priceAnalysisPrompt = `Notei que o preço subiu ${formatCurrency(difference)} desde a nossa última pesquisa. Meu conselho? Vamos ficar de olho por mais um tempo, as tarifas aéreas podem ser voláteis!`;
        } else if (difference < 0) {
            priceAnalysisPrompt = `Excelente notícia! O preço caiu ${formatCurrency(Math.abs(difference))} desde a última vez que verificamos. Esta pode ser uma ótima oportunidade para garantir sua reserva!`;
        } else {
            priceAnalysisPrompt = `O preço permaneceu estável desde a última pesquisa. Estamos em uma boa posição para continuar monitorando sem pressa.`;
        }
    }
    
    const prompt = `
        Você é Ernest, um agente de viagens amigável e entusiasmado. Crie um resumo de e-mail caloroso, pessoal e fácil de entender para um cliente. Use um tom encorajador e alguns emojis.

        O e-mail deve:
        1. Começar com uma saudação animada.
        2. Apresentar o custo total estimado dos voos.
        3. Incluir a seguinte análise de preço e recomendação (disclaimer): "${priceAnalysisPrompt}".
        4. Descrever o roteiro de voos de maneira simples.
        5. Mencionar as sugestões de hospedagem.
        6. Finalizar com uma nota otimista sobre o monitoramento contínuo.
        7. Não inclua uma despedida formal.

        Dados da Viagem:
        - Custo Total dos Voos: ${formatCurrency(totalFlightCost)}
        - Voos: ${JSON.stringify(results.flights.map(f => `${f.from} -> ${f.to} com ${f.airline}`))}
        - Hospedagens: ${JSON.stringify(results.accommodations.map(h => `${h.days} dias em ${h.city} no ${h.name}`))}
    `;

    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        return response.text;
    } catch (error) {
        console.error("Error generating email summary:", error);
        return "Não foi possível gerar o resumo do e-mail no momento.";
    }
};

const getWhatsAppSummary = async (results: TripResults, previousPrice: number | null): Promise<string> => {
    const totalFlightCost = results.flights.reduce((sum, leg) => sum + leg.price, 0);
    
    let priceAnalysisPrompt = `Este é nosso ponto de partida para monitorar os preços!`;
    if (previousPrice) {
        const difference = totalFlightCost - previousPrice;
        if (difference > 0) {
            priceAnalysisPrompt = `*Análise de Preço:* O valor subiu ${formatCurrency(difference)} desde a última busca. _Meu conselho é esperarmos um pouco para ver se as tarifas melhoram!_  صبر`;
        } else if (difference < 0) {
            priceAnalysisPrompt = `*Análise de Preço:* Boa notícia! O valor caiu ${formatCurrency(Math.abs(difference))}. _Pode ser um ótimo momento para reservar!_ 🎉`;
        } else {
            priceAnalysisPrompt = `*Análise de Preço:* O valor está estável. _Seguimos monitorando com calma!_ 👀`;
        }
    }

    const prompt = `
        Você é Ernest, um agente de viagens. Crie um resumo conciso e amigável para o WhatsApp. Use bullet points com emojis e a sintaxe do WhatsApp (*para negrito*, _para itálico_).

        O resumo deve conter:
        - Uma saudação rápida.
        - Um bullet point com o custo total dos voos.
        - O seguinte bullet point de análise de preço: "${priceAnalysisPrompt}".
        - Um bullet point com o roteiro de voo.
        - Um bullet point com as cidades de hospedagem.
        - Um call-to-action final.

        Dados da Viagem:
        - Custo Total dos Voos: ${formatCurrency(totalFlightCost)}
        - Rota: ${results.flights.map(f => f.from.split(' ')[0]).join(' -> ')} -> ${results.flights[results.flights.length - 1].to.split(' ')[0]}
        - Cidades: ${results.accommodations.map(h => h.city).join(', ')}
    `;
    
    try {
        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        return response.text;
    } catch (error) {
        console.error("Error generating WhatsApp summary:", error);
        return "Não foi possível gerar o resumo do WhatsApp.";
    }
};


// --- UTILS --- //
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const getInitialDate = () => {
    const today = new Date();
    today.setMonth(today.getMonth() + 2);
    return today.toISOString().split('T')[0];
};

const getInitialReturnDate = (startDate: string) => {
    if (!startDate) return '';
    const date = new Date(startDate + 'T00:00:00');
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
};

const getMinDate = () => new Date().toISOString().split('T')[0];

const getMaxDate = () => {
    const today = new Date();
    const nextYear = today.getFullYear() + 1;
    return `${nextYear}-12-31`;
};

// --- COMPONENTS --- //

const FlightCard: React.FC<{ leg: FlightLeg }> = ({ leg }) => {
    const departureDateForUrl = leg.departure.split(' ')[0] || '';
    const origin = leg.from.split(' ')[0];
    const destination = leg.to.split(' ')[0];
    const flightSearchUrl = `https://www.google.com/flights#flt=${origin}.${destination}.${departureDateForUrl};c:BRL;e:1;sd:1;t:f`;

    return (
      <div className="flight-leg">
        <div className="route">
          <h3>{leg.from} → {leg.to}</h3>
          <p>{leg.airline}</p>
        </div>
        <div className="details">
          <p>{translations.depart}: {leg.departure}</p>
          <p>{translations.arrive}: {leg.arrival}</p>
        </div>
        <div className="price-info">
          <p>{formatCurrency(leg.price)}</p>
          <a href={flightSearchUrl} target="_blank" rel="noopener noreferrer" className="details-link">{translations.viewFlight}</a>
        </div>
      </div>
    );
};

const HotelCard: React.FC<{ stay: HotelStay }> = ({ stay }) => {
    const hotelSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${stay.name} ${stay.city}`)}`;
    return (
      <div className="hotel-stay">
        <div className="hotel-info">
          <h3>{stay.name}</h3>
          <p>{stay.city}</p>
        </div>
        <div className="details">
          <p>{stay.days} {translations.days}</p>
          <p>{translations.checkIn}: {new Date(stay.checkInDate + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
        </div>
        <div className="price-info">
          <p>{formatCurrency(stay.pricePerNight * stay.days)}</p>
          <a href={hotelSearchUrl} target="_blank" rel="noopener noreferrer" className="details-link">{translations.viewHotel}</a>
        </div>
      </div>
    );
};

const PriceChart: React.FC<{ history: PriceHistoryPoint[]; onExport: () => void; }> = ({ history, onExport }) => {
    if (history.length === 0) return null;
    
    const maxPrice = Math.max(...history.map(item => item.price), 0);

    const renderChange = (change: number | null) => {
        if (change === null) return <span>-</span>;
        if (change === 0) return <span>{formatCurrency(0)}</span>;
        const isPositive = change > 0;
        return (
            <span className={isPositive ? 'price-increase' : 'price-decrease'}>
                {isPositive ? '↑' : '↓'} {formatCurrency(Math.abs(change))}
            </span>
        );
    };

    return (
        <div className="card chart-container">
            <div className="chart-header">
                <h2>{translations.priceVariationChart}</h2>
                <button onClick={onExport} className="export-button">{translations.exportButton}</button>
            </div>
            <div className="chart-bars">
                {history.map((item, index) => {
                    const heightPercent = maxPrice > 0 ? (item.price / maxPrice) * 100 : 0;
                    const dateObj = new Date(item.date);
                    const dateLabel = dateObj.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
                    const changeText = item.change !== null 
                        ? ` (${item.change > 0 ? '+' : ''}${formatCurrency(item.change)})` 
                        : '';
                    const tooltipText = `${formatCurrency(item.price)} ${translations.tooltipOn} ${dateLabel}${changeText}`;

                    return (
                        <div key={index} className="chart-bar" style={{ height: `${heightPercent}%` }}>
                            <span className="tooltip">{tooltipText}</span>
                            <div className="bar-label">{dateLabel}</div>
                        </div>
                    );
                })}
            </div>
            <div className="chart-table-container">
                <table>
                    <thead>
                        <tr>
                            <th>{translations.chartTableDate}</th>
                            <th>{translations.chartTablePrice}</th>
                            <th>{translations.chartTableVariation}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.slice().reverse().map((item, index) => (
                            <tr key={index}>
                                <td>{new Date(item.date).toLocaleDateString('pt-BR')}</td>
                                <td>{formatCurrency(item.price)}</td>
                                <td>{renderChange(item.change)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const EmailPreviewCard: React.FC<{ summary: string }> = ({ summary }) => {
    const handleSendEmail = () => {
        const recipientEmail = "fernandomagosso@gmail.com"; // Placeholder for recipient's email
        const subject = "Sua Cotação de Viagem para a Europa | Escapadas Europeias do Ernest";
        const mailtoLink = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summary)}`;
        window.location.href = mailtoLink;
    };
    
    return (
        <div className="card email-preview">
            <h2>{translations.emailPreviewTitle}</h2>
            <div className="email-content">
                {summary.split('\n').map((line, index) => (
                    <p key={index}>{line || <br />}</p> 
                ))}
            </div>
            <button onClick={handleSendEmail} className="send-email-button">{translations.sendEmailButton}</button>
        </div>
    );
};

const WhatsAppPreviewCard: React.FC<{ summary: string }> = ({ summary }) => {
    const handleSendWhatsApp = () => {
        // Placeholder for recipient's WhatsApp number (e.g., 5511999999999 for Brazil)
        const phoneNumber = "5511971308838"; 
        const whatsappLink = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(summary)}`;
        window.open(whatsappLink, '_blank');
    };

    const formatWhatsAppMessage = (text: string) => {
        return text
            .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
            .replace(/_([^_]+)_/g, '<em>$1</em>');
    };
    
    return (
        <div className="card whatsapp-preview">
            <h2>{translations.whatsappPreviewTitle}</h2>
            <div className="whatsapp-content" dangerouslySetInnerHTML={{ __html: formatWhatsAppMessage(summary).replace(/\n/g, '<br />') }} />
            <button onClick={handleSendWhatsApp} className="send-whatsapp-button">{translations.sendWhatsAppButton}</button>
        </div>
    );
};

interface PassengerControlProps {
    label: string;
    count: number;
    onDecrement: () => void;
    onIncrement: () => void;
}
const PassengerControl: React.FC<PassengerControlProps> = ({ label, count, onDecrement, onIncrement }) => (
    <div className="passenger-row">
        <span>{label}</span>
        <div className="passenger-controls">
            <button onClick={onDecrement} className="control-button" aria-label={`Diminuir número de ${label}`}>-</button>
            <span className="passenger-count">{count}</span>
            <button onClick={onIncrement} className="control-button" aria-label={`Aumentar número de ${label}`}>+</button>
        </div>
    </div>
);

const App: React.FC = () => {
  const initialDeparture = getInitialDate();
  const [departureDate, setDepartureDate] = useState<string>(initialDeparture);
  const [returnDate, setReturnDate] = useState<string>(getInitialReturnDate(initialDeparture));
  const [adults, setAdults] = useState<number>(2);
  const [children, setChildren] = useState<number>(1);
  const [isPassengerPopoverOpen, setIsPassengerPopoverOpen] = useState(false);
  const [results, setResults] = useState<TripResults | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<StoredSearch[]>([]);
  const [emailSummary, setEmailSummary] = useState<string | null>(null);
  const [whatsappSummary, setWhatsappSummary] = useState<string | null>(null);
  const passengerSelectorRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    try {
        const storedHistory = localStorage.getItem('searchHistory');
        if (storedHistory) {
            setSearchHistory(JSON.parse(storedHistory));
        }
    } catch (e) {
        console.error("Failed to parse search history from localStorage", e);
        localStorage.removeItem('searchHistory');
    }
  }, []);
  
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (passengerSelectorRef.current && !passengerSelectorRef.current.contains(event.target as Node)) {
                setIsPassengerPopoverOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

  const handleSearch = async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);
    setEmailSummary(null);
    setWhatsappSummary(null);

    try {
      const data = await getTripData(departureDate, returnDate, adults, children);
      setResults(data);

      const previousPrice = searchHistory.length > 0 ? searchHistory[searchHistory.length - 1].totalFlightPrice : null;

      const summaryPromises = [
          getEmailSummary(data, previousPrice),
          getWhatsAppSummary(data, previousPrice)
      ];

      const totalFlightPrice = data.flights.reduce((sum, leg) => sum + leg.price, 0);
      const newHistoryEntry: StoredSearch = {
          timestamp: new Date().toISOString(),
          totalFlightPrice: totalFlightPrice,
          results: data
      };
      
      setSearchHistory(prevHistory => {
          const updatedHistory = [...prevHistory, newHistoryEntry].slice(-7);
          localStorage.setItem('searchHistory', JSON.stringify(updatedHistory));
          return updatedHistory;
      });

      const [email, whatsapp] = await Promise.all(summaryPromises);
      setEmailSummary(email);
      setWhatsappSummary(whatsapp);

    } catch (err: any) {
      setError(err.message || translations.errorDefault);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleExportToCSV = () => {
    if (searchHistory.length === 0) {
        alert("Não há histórico de busca para exportar.");
        return;
    }

    const headers = [
        "Data da Busca", "Origem", "Destino", "Companhia Aérea",
        "Data Partida", "Data Chegada", "Preço (BRL)", "Link Direto"
    ];

    const csvRows = [headers.join(',')];

    searchHistory.forEach(search => {
        const searchDate = new Date(search.timestamp).toLocaleString('pt-BR');
        search.results.flights.forEach(leg => {
            const departureDateForUrl = leg.departure.split(' ')[0] || '';
            const origin = leg.from.split(' ')[0];
            const destination = leg.to.split(' ')[0];
            const flightSearchUrl = `https://www.google.com/flights#flt=${origin}.${destination}.${departureDateForUrl};c:BRL;e:1;sd:1;t:f`;

            const row = [
                searchDate,
                `"${leg.from}"`,
                `"${leg.to}"`,
                `"${leg.airline}"`,
                leg.departure,
                leg.arrival,
                leg.price,
                flightSearchUrl
            ];
            csvRows.push(row.join(','));
        });
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "historico_viagens_ernest.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalFlightCost = results?.flights.reduce((sum, leg) => sum + leg.price, 0) ?? 0;

  const priceHistoryForChart: PriceHistoryPoint[] = searchHistory.map((item, index, arr) => {
    const previousPrice = index > 0 ? arr[index - 1].totalFlightPrice : null;
    const change = previousPrice !== null ? item.totalFlightPrice - previousPrice : null;
    return {
        date: item.timestamp,
        price: item.totalFlightPrice,
        change: change
    };
  });


  return (
    <div className="container">
      <header>
        <h1>{translations.title}</h1>
        <p>{translations.subtitle}</p>
      </header>

      <main>
        <div className="card form-container">
          <div className="form-group">
            <label htmlFor="departure">{translations.departureLabel}</label>
            <input
              type="date"
              id="departure"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              min={getMinDate()}
              max={getMaxDate()}
              aria-label="Selecione a data de partida"
            />
          </div>
           <div className="form-group">
            <label htmlFor="return">{translations.returnLabel}</label>
            <input
                type="date"
                id="return"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                min={departureDate}
                max={getMaxDate()}
                aria-label="Selecione a data de retorno"
            />
          </div>
          <div className="form-group passenger-selector" ref={passengerSelectorRef}>
            <label>{translations.passengersLabel}</label>
            <button className="passenger-selector-button" onClick={() => setIsPassengerPopoverOpen(!isPassengerPopoverOpen)} aria-haspopup="true" aria-expanded={isPassengerPopoverOpen}>
                {`${adults} ${translations.adultsLabel}, ${children} ${translations.childrenLabel}`}
            </button>
            {isPassengerPopoverOpen && (
                <div className="passenger-popover">
                    <PassengerControl
                        label={translations.adultsLabel}
                        count={adults}
                        onDecrement={() => setAdults(Math.max(1, adults - 1))}
                        onIncrement={() => setAdults(adults + 1)}
                    />
                    <PassengerControl
                        label={translations.childrenLabel}
                        count={children}
                        onDecrement={() => setChildren(Math.max(0, children - 1))}
                        onIncrement={() => setChildren(children + 1)}
                    />
                </div>
            )}
           </div>
          <button className="search-button" onClick={handleSearch} disabled={isLoading}>
            {isLoading ? translations.searchingButton : translations.searchButton}
          </button>
        </div>

        {isLoading && (
          <div className="loader">
            <div className="spinner"></div>
            <p>{translations.loadingText}</p>
          </div>
        )}
        
        {error && <div className="error"><p>{error}</p></div>}

        {results && (
          <div className="card">
             <div className="total-cost">
                <p>{translations.totalFlightCost}</p>
                <span className="price">{formatCurrency(totalFlightCost)}</span>
            </div>
            <div className="results-grid">
                <section className="results" aria-labelledby="flights-heading">
                    <h2 id="flights-heading">{translations.flightItinerary}</h2>
                    {results.flights.map((leg, index) => (
                        <FlightCard key={index} leg={leg} />
                    ))}
                </section>

                <section className="results" aria-labelledby="hotels-heading">
                    <h2 id="hotels-heading">{translations.accommodation}</h2>
                    {results.accommodations.map((stay, index) => (
                        <HotelCard key={index} stay={stay} />
                    ))}
                </section>
            </div>
          </div>
        )}

        {!isLoading && (emailSummary || whatsappSummary) && (
            <div className="summaries-container">
                {emailSummary && <EmailPreviewCard summary={emailSummary} />}
                {whatsappSummary && <WhatsAppPreviewCard summary={whatsappSummary} />}
            </div>
        )}
        
        <PriceChart history={priceHistoryForChart} onExport={handleExportToCSV} />
      </main>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);