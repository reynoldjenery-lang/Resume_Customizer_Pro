import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FileText, Plus, Search, Filter, Edit, Eye, Trash2 } from 'lucide-react';
import AdvancedRequirementsForm from './advanced-requirements-form';

export default function RequirementsSection() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showRequirementForm, setShowRequirementForm] = useState(false);
  const [selectedRequirement, setSelectedRequirement] = useState<any>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  // Fetch consultants for assignment
  const { data: consultants = [] } = useQuery({
    queryKey: ['/api/marketing/consultants'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/marketing/consultants?status=Active');
        if (!response.ok) return [];
        return response.json();
      } catch {
        return [] as any[];
      }
    },
    retry: false,
  });

  const mockRequirements = [
    {
      id: '1',
      jobTitle: 'Senior React Developer',
      clientCompany: 'Tech Solutions Inc',
      status: 'New',
      assignedTo: 'John Doe',
      primaryTechStack: 'React, TypeScript, Node.js',
      createdAt: new Date(),
    },
    {
      id: '2',
      jobTitle: 'Full Stack Developer',
      clientCompany: 'StartupCorp',
      status: 'Working',
      assignedTo: 'Jane Smith',
      primaryTechStack: 'Python, Django, React',
      createdAt: new Date(),
    },
  ];

  const statusOptions = ['All', 'New', 'Working', 'Applied', 'Submitted', 'Interviewed', 'Cancelled'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return 'bg-blue-100 text-blue-800';
      case 'Working': return 'bg-yellow-100 text-yellow-800';
      case 'Applied': return 'bg-purple-100 text-purple-800';
      case 'Submitted': return 'bg-orange-100 text-orange-800';
      case 'Interviewed': return 'bg-green-100 text-green-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleAddRequirement = () => {
    setSelectedRequirement(null);
    setShowRequirementForm(true);
  };

  const handleEditRequirement = (requirement: any) => {
    setSelectedRequirement(requirement);
    setShowEditForm(true);
  };

  const handleFormClose = () => {
    setShowRequirementForm(false);
    setShowEditForm(false);
    setSelectedRequirement(null);
  };

  const handleFormSubmit = async (requirementData: any[]) => {
    console.log('Submitting requirements:', requirementData);
    // Handle form submission
    return Promise.resolve();
  };

  const getConsultantName = (consultantId: string) => {
    const consultant = consultants.find((c: any) => c.id === consultantId);
    return consultant?.name || 'Unassigned';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search requirements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-border rounded-md px-3 py-2 text-sm bg-background"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Filter size={16} className="mr-2" />
            More Filters
          </Button>
          <Button onClick={handleAddRequirement}>
            <Plus size={16} className="mr-2" />
            New Requirement
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {mockRequirements.map((requirement) => (
          <Card key={requirement.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="font-semibold text-lg">{requirement.jobTitle}</h3>
                    <Badge className={getStatusColor(requirement.status)}>{requirement.status}</Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                    <div><span className="font-medium">Client:</span> {requirement.clientCompany}</div>
                    <div><span className="font-medium">Assigned to:</span> {requirement.assignedTo}</div>
                    <div><span className="font-medium">Tech Stack:</span> {requirement.primaryTechStack}</div>
                    <div><span className="font-medium">Created:</span> {requirement.createdAt.toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm"><Eye size={16} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleEditRequirement(requirement)}><Edit size={16} /></Button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700"><Trash2 size={16} /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {mockRequirements.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No requirements found</h3>
            <p className="text-muted-foreground mb-4">Create your first requirement to get started.</p>
            <Button onClick={handleAddRequirement}><Plus size={16} className="mr-2" />Create New Requirement</Button>
          </CardContent>
        </Card>
      )}

      <Card className="mt-8">
        <CardHeader><CardTitle>📋 Requirements Management</CardTitle></CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-4">This section will include:</p>
            <ul className="text-left max-w-md mx-auto space-y-2">
              <li>✅ Requirements list with filters</li>
              <li>🔄 Create/Edit requirement forms</li>
              <li>💬 Marketing comments system</li>
              <li>🔗 Multi-entry support</li>
              <li>📊 Status tracking</li>
              <li>🎯 Consultant assignment</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Requirements Form */}
      {(showRequirementForm || showEditForm) && (
        <AdvancedRequirementsForm
          open={showRequirementForm || showEditForm}
          onClose={handleFormClose}
          onSubmit={handleFormSubmit}
          consultants={consultants}
          initialData={showEditForm ? selectedRequirement : undefined}
          editMode={showEditForm}
        />
      )}
    </div>
  );
}
