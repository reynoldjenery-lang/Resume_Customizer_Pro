import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  FileText,
  Calendar,
  Users,
  BarChart3,
  MessageSquare,
  Inbox,
  Send,
  FileEdit,
  Plus,
  Settings,
  LogOut,
} from 'lucide-react';

// Import Marketing components
import ModernEmailClient from '@/components/marketing/modern-email-client';
import RequirementsSection from '@/components/marketing/requirements-section';
import InterviewsSection from '@/components/marketing/interviews-section';
import ConsultantsSection from '@/components/marketing/consultants-section';

export default function MarketingPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('emails');

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
        return <ModernEmailClient />;
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

  return (
  <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <MessageSquare className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Marketing Module</h1>
                <p className="text-xs text-muted-foreground">Resume Customizer Pro</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                Marketing Team
              </Badge>
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-foreground">
                    {marketingUser?.firstName?.[0] || marketingUser?.email?.[0] || 'M'}
                  </span>
                </div>
                <span className="text-sm font-medium text-foreground hidden sm:inline-block">
                  {marketingUser?.firstName || marketingUser?.email || 'Marketing User'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (window.location.href = '/')}
                  className="hover:bg-gray-50"
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
  <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Navigation */}
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {navigationItems.map((item) => {
              const IconComponent = item.icon;
              const isActive = activeSection === item.id;

              return (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                    isActive
                      ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-200'
                      : 'hover:bg-secondary/50'
                  }`}
                  onClick={() => setActiveSection(item.id)}
                >
                  <CardContent className="p-4 text-center">
                    <div
                      className={`h-12 w-12 mx-auto rounded-lg flex items-center justify-center mb-3 ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-secondary text-secondary-foreground'
                      }`}
                    >
                      <IconComponent size={24} />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{item.label}</h3>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>


        {/* Quick Stats - Only show in Requirements section */}
        {activeSection === 'requirements' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Requirements</p>
                    <p className="text-2xl font-bold text-foreground">24</p>
                  </div>
                  <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText className="text-green-600" size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Upcoming Interviews</p>
                    <p className="text-2xl font-bold text-foreground">8</p>
                  </div>
                  <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calendar className="text-blue-600" size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Unread Emails</p>
                    <p className="text-2xl font-bold text-foreground">12</p>
                  </div>
                  <div className="h-10 w-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Inbox className="text-orange-600" size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content Area */}
  <Card className="min-h-[700px] w-full">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
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
                  <Button size="sm">
                    <Send size={16} className="mr-2" />
                    Compose
                  </Button>
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
