import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Mail, FileText, Calendar, Users, ChartBar as BarChart3, MessageSquare, Inbox, Send, File as FileEdit, Plus, Settings, LogOut } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

// Import Marketing components
import ModernEmailClient from '@/components/marketing/modern-email-client';
import RequirementsSection from '@/components/marketing/requirements-section';
import InterviewsSection from '@/components/marketing/interviews-section';
import ConsultantsSection from '@/components/marketing/consultants-section';

export default function MarketingPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('emails');
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string | null>(null);

  const navigationItems = [
    { id: 'emails', label: 'Emails', icon: Mail, description: 'Gmail-like email management' },
    {
      id: 'requirements',
      label: 'Requirements',
      icon: FileText,
      description: 'Manage job requirements',
    },
    {
      id: 'interviews',
      label: 'Interviews',
      icon: Calendar,
      description: 'Schedule and track interviews',
    },
    {
      id: 'consultants',
      label: 'Consultants',
      icon: Users,
      description: 'Manage consultant profiles',
    },
  ];

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'emails':
        return <ModernEmailClient accountFilter={selectedEmailAccountId} />;
      case 'consultants':
        return <ConsultantsSection />;
      case 'requirements':
        return <RequirementsSection />;
      case 'interviews':
        return <InterviewsSection />;
      default:
        return <ModernEmailClient />;
    }
  };

  // Define type for user object
  interface MarketingUser {
    firstName?: string;
    email?: string;
  }

  const marketingUser = user as MarketingUser;

  // Fetch total unread messages count from server (more efficient for large inboxes)
  const { data: unreadData = { unreadCount: 0, perAccount: [] }, isLoading: inboxLoading } = useQuery<{ unreadCount: number; perAccount?: any[] } | undefined>({
    queryKey: ['/api/marketing/emails/unread-count'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/marketing/emails/unread-count');
        if (!response.ok) return { unreadCount: 0 } as { unreadCount: number };
        return response.json();
      } catch (e) {
        return { unreadCount: 0 } as { unreadCount: number };
      }
    },
    staleTime: 15_000,
    retry: false,
  });

  const unreadCount = unreadData?.unreadCount || 0;
  const [srMessage, setSrMessage] = useState('');
  const [filterHistory, setFilterHistory] = useState<Array<string | null>>([]);

  // Load persisted filter history and selected account from localStorage
  useEffect(() => {
    try {
      const rawHistory = localStorage.getItem('marketing.filterHistory');
      if (rawHistory) {
        const parsed = JSON.parse(rawHistory) as Array<string | null>;
        setFilterHistory(parsed || []);
      }
      const rawSelected = localStorage.getItem('marketing.selectedEmailAccount');
      if (rawSelected !== null) {
        setSelectedEmailAccountId(rawSelected || null);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Persist selectedEmailAccountId to localStorage
  useEffect(() => {
    try {
      if (selectedEmailAccountId) {
        localStorage.setItem('marketing.selectedEmailAccount', selectedEmailAccountId);
      } else {
        localStorage.removeItem('marketing.selectedEmailAccount');
      }
    } catch (e) {}
  }, [selectedEmailAccountId]);

  const pushHistory = (prev: string | null) => {
    setFilterHistory((h) => {
      const next = [...h, prev];
      try { localStorage.setItem('marketing.filterHistory', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  const undoFilter = () => {
    setFilterHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      const rest = h.slice(0, -1);
      setSelectedEmailAccountId(last || null);
      setSrMessage(last ? 'Filter restored' : 'Filter cleared');
      try { localStorage.setItem('marketing.filterHistory', JSON.stringify(rest)); } catch (e) {}
      try { if (last) localStorage.setItem('marketing.selectedEmailAccount', last); else localStorage.removeItem('marketing.selectedEmailAccount'); } catch (e) {}
      toast.success('Filter restored', { duration: 1500 });
      return rest;
    });
  };

  return (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
            {/* Screen reader live region for filter announcements */}
            <div aria-live="polite" role="status" className="sr-only">
              {srMessage}
            </div>
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                <MessageSquare className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-semibold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">Marketing Module</h1>
                <p className="text-xs text-slate-500">Resume Customizer Pro</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-blue-200/50 shadow-sm">
                Marketing Team
              </Badge>
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-md">
                  <span className="text-sm font-medium text-white">
                    {marketingUser?.firstName?.[0] || marketingUser?.email?.[0] || 'M'}
                  </span>
                </div>
                <span className="text-sm font-medium text-slate-700 hidden sm:inline-block">
                  {marketingUser?.firstName || marketingUser?.email || 'Marketing User'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (window.location.href = '/')}
                  className="hover:bg-slate-50 border-slate-200 transition-all hover:shadow-md"
                >
                  <LogOut size={16} className="mr-1.5" />
                  <span className="hidden sm:inline-block">Back to Dashboard</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>
  <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = activeSection === item.id;

              return (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-all duration-300 hover:shadow-lg group ${
                    isActive
                      ? 'ring-2 ring-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-md'
                      : 'hover:bg-slate-50 hover:border-slate-300'
                  }`}
                  onClick={() => setActiveSection(item.id)}
                >
                  <CardContent className="p-5 text-center">
                    <div
                      className={`h-14 w-14 mx-auto rounded-xl flex items-center justify-center mb-4 transition-all duration-300 ${
                        isActive
                          ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/40 scale-105'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200 group-hover:scale-105'
                      }`}
                    >
                      <IconComponent size={26} />
                    </div>
                    <h3 className={`font-semibold text-sm mb-1.5 transition-colors ${
                      isActive ? 'text-blue-900' : 'text-slate-700 group-hover:text-slate-900'
                    }`}>{item.label}</h3>
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-xs text-slate-500">{item.description}</p>
                      {item.id === 'emails' && (
                        <Badge className="bg-gradient-to-r from-orange-600 to-amber-600 text-white">{inboxLoading ? '...' : unreadCount}</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>


        {/* Quick Stats - Only show in Requirements section */}
        {activeSection === 'requirements' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 animate-in fade-in duration-500">
            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-2">Active Requirements</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">24</p>
                  </div>
                  <div className="h-12 w-12 bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl flex items-center justify-center">
                    <FileText className="text-green-600" size={24} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-2">Upcoming Interviews</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">8</p>
                  </div>
                  <div className="h-12 w-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center">
                    <Calendar className="text-blue-600" size={24} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Unread Emails stat moved to Emails header */}
          </div>
        )}

        {/* Main Content Area */}
  <Card className="min-h-[700px] w-full shadow-lg border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-3 text-slate-800">
                {(() => {
                  const activeItem = navigationItems.find((item) => item.id === activeSection);
                  const IconComponent = activeItem?.icon || Mail;
                  return (
                    <>
                      <IconComponent size={24} />
                      <span>{activeItem?.label || 'Emails'}</span>
                    </>
                  );
                })()}
              </CardTitle>

              {/* Section-specific action buttons */}
              <div className="flex items-center space-x-2">
                {activeSection === 'emails' && (
                  <div className="flex items-center gap-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="h-9 w-auto flex items-center bg-gradient-to-br from-orange-100 to-amber-100 rounded-md px-3 py-1 shadow-sm cursor-pointer">
                          <Inbox className="text-orange-600" size={16} />
                          <span className="ml-2 text-sm font-medium text-slate-700">Unread</span>
                          <Badge className="ml-3 bg-gradient-to-r from-orange-600 to-amber-600 text-white">
                            {inboxLoading ? '...' : unreadCount}
                          </Badge>
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <div className="p-2 text-xs text-slate-500">Unread by account</div>
                        <DropdownMenuItem className="text-sm" onClick={() => {
                          const previous = selectedEmailAccountId;
                          setFilterHistory(h => [...h, previous]);
                          setSelectedEmailAccountId(null);
                          setActiveSection('emails');
                          setSrMessage('Showing all accounts');
                          toast.info('Showing all accounts', {
                            duration: 3000,
                            action: {
                              label: 'Undo',
                              onClick: () => {
                                // Pop last history and restore
                                setFilterHistory(h => {
                                  const last = h[h.length - 1];
                                  const rest = h.slice(0, -1);
                                  setSelectedEmailAccountId(last || null);
                                  setSrMessage(last ? `Filter restored` : 'Filter cleared');
                                  toast.success('Filter restored', { duration: 1500 });
                                  return rest;
                                });
                              }
                            }
                          });
                        }}>
                          Show all accounts
                        </DropdownMenuItem>
                        {Array.isArray(unreadData?.perAccount) && unreadData!.perAccount.length > 0 ? (
                          unreadData!.perAccount.map((acc: any) => (
                            <DropdownMenuItem key={acc.accountId || acc.emailAddress} className="flex justify-between items-center" onClick={() => {
                              const previous = selectedEmailAccountId;
                              setFilterHistory(h => [...h, previous]);
                              setSelectedEmailAccountId(acc.accountId || null);
                              setActiveSection('emails');
                              setSrMessage(`Filtering to ${acc.accountName || acc.emailAddress}`);
                              toast.info(`Filtering to ${acc.accountName || acc.emailAddress}`, {
                                duration: 3000,
                                action: {
                                  label: 'Undo',
                                  onClick: () => {
                                    // Restore most recent previous value from history
                                    setFilterHistory(h => {
                                      const last = h[h.length - 1];
                                      const rest = h.slice(0, -1);
                                      setSelectedEmailAccountId(last || null);
                                      setSrMessage(last ? `Filter restored` : 'Filter cleared');
                                      toast.success('Filter restored', { duration: 1500 });
                                      return rest;
                                    });
                                  }
                                }
                              });
                            }}>
                              <div className="text-sm">
                                <div className="font-medium">{acc.accountName || acc.emailAddress || 'Unknown'}</div>
                                {acc.emailAddress && <div className="text-xs text-slate-400">{acc.emailAddress}</div>}
                              </div>
                              <div className="ml-4">
                                <Badge className="bg-gradient-to-r from-orange-600 to-amber-600 text-white">{acc.unreadCount}</Badge>
                              </div>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem className="text-sm text-slate-500">No unread messages</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {filterHistory.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => undoFilter()} className="ml-2">
                        Undo
                      </Button>
                    )}
                  </div>
                )}
                {activeSection === 'requirements' && (
                  <Button size="sm">
                    <Plus size={16} className="mr-2" />
                    New Requirement
                  </Button>
                )}
                {activeSection === 'interviews' && (
                  <Button size="sm">
                    <Plus size={16} className="mr-2" />
                    Schedule Interview
                  </Button>
                )}
                {activeSection === 'consultants' && (
                  <Button size="sm">
                    <Plus size={16} className="mr-2" />
                    Add Consultant
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">{renderActiveSection()}</CardContent>
        </Card>
      </div>
    </div>
  );
}
