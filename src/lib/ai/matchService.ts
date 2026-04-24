interface UserProfile {
  name: string;
  skills: string[];
  location: string;
  description: string;
  availability: string;
}

interface Project {
  id: string;
  title: string;
  organization: string;
  description: string;
  theme: string;
  location: string;
  skills: string[];
}

interface MatchResult {
  projectId: string;
  score: number;
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
}

export class MatchService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const apiKey = process.env.IBM_API_KEY;
    const url = 'https://iam.cloud.ibm.com/identity/token';

    if (!apiKey) {
      throw new Error('IBM_API_KEY not configured');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apiKey}`,
    });

    if (!response.ok) {
      throw new Error('Failed to get IBM access token');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + 50 * 60 * 1000;

    if (!this.accessToken) {
      throw new Error('No access token received from IBM');
    }

    return this.accessToken;
  }

  async findBestMatches(
    user: UserProfile,
    projects: Project[],
    limit: number = 10
  ): Promise<MatchResult[]> {
    if (!projects || projects.length === 0) {
      return [];
    }

    // =========================
    // PRÉ-FILTRO INTELIGENTE BASEADO EM SKILLS
    // =========================
    const filteredProjects = this.smartPreFilter(user, projects);
    
    console.log(`📊 Pré-filtro: ${projects.length} -> ${filteredProjects.length} projetos`);
    console.log(`🎯 Skills do usuário: ${user.skills.join(', ')}`);
    
    if (filteredProjects.length === 0) {
      console.log('⚠️ Nenhum projeto passou no pré-filtro, usando fallback');
      return this.fallbackMatch(user, projects, limit);
    }

    // Se não tiver WatsonX configurado, usar fallback
    if (!process.env.IBM_API_KEY || !process.env.IBM_URL || !process.env.IBM_PROJECT_ID) {
      console.log('WatsonX not configured, using fallback matching');
      return this.fallbackMatch(user, filteredProjects, limit);
    }

    try {
      const accessToken = await this.getAccessToken();
      
      // Processar apenas os projetos pré-filtrados
      const batchSize = 3; // Menor batch para análise mais detalhada
      const results: MatchResult[] = [];
      
      for (let i = 0; i < filteredProjects.length; i += batchSize) {
        const batch = filteredProjects.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(project => this.deepAnalyzeMatch(user, project, accessToken))
        );
        results.push(...batchResults);
        
        // Pausa entre lotes
        if (i + batchSize < filteredProjects.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Ordenar por score
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
      
    } catch (error) {
      console.error('WatsonX match error:', error);
      return this.fallbackMatch(user, filteredProjects, limit);
    }
  }

  /**
   * PRÉ-FILTRO INTELIGENTE - Reduz projetos baseado nas skills do usuário
   */
  private smartPreFilter(user: UserProfile, projects: Project[]): Project[] {
    const userSkills = user.skills.map(s => s.toLowerCase());
    
    // Se não tem skills, retorna todos
    if (userSkills.length === 0) {
      return projects;
    }
    
    // Calcular score de relevância para cada projeto
    const scoredProjects = projects.map(project => {
      const projectSkills = project.skills.map(s => s.toLowerCase());
      const projectText = `${project.title} ${project.description} ${project.theme}`.toLowerCase();
      
      let relevanceScore = 0;
      const matchedSkills: string[] = [];
      
      // 1. Match direto de skills (peso 3)
      for (const userSkill of userSkills) {
        for (const projectSkill of projectSkills) {
          if (userSkill.includes(projectSkill) || projectSkill.includes(userSkill)) {
            relevanceScore += 3;
            matchedSkills.push(projectSkill);
            break;
          }
        }
      }
      
      // 2. Skills mencionadas na descrição (peso 2)
      for (const userSkill of userSkills) {
        if (projectText.includes(userSkill)) {
          relevanceScore += 2;
        }
      }
      
      // 3. Bônus por tema relacionado (peso 1)
      const themeMatch = project.theme?.toLowerCase() || '';
      for (const userSkill of userSkills) {
        if (themeMatch.includes(userSkill)) {
          relevanceScore += 1;
        }
      }
      
      return { project, relevanceScore, matchedSkillsCount: matchedSkills.length };
    });
    
    // Filtrar apenas projetos com score > 0 OR pelo menos 1 skill match
    let filtered = scoredProjects.filter(p => p.relevanceScore > 0);
    
    // Se muito restritivo, expandir um pouco
    if (filtered.length < 3 && projects.length > 0) {
      console.log('Expandindo filtro - poucos projetos encontrados');
      filtered = scoredProjects.slice(0, Math.min(10, projects.length));
    }
    
    // Se ainda assim não tem projetos, pegar os primeiros 10
    if (filtered.length === 0 && projects.length > 0) {
      filtered = scoredProjects.slice(0, Math.min(10, projects.length));
    }
    
    return filtered.map(f => f.project);
  }

  /**
   * ANÁLISE DETALHADA COM WATSONX
   */
  private async deepAnalyzeMatch(
    user: UserProfile,
    project: Project,
    accessToken: string
  ): Promise<MatchResult> {
    // Prompt mais detalhado e específico
    const prompt = this.buildDetailedPrompt(user, project);
    
    const response = await fetch(`${process.env.IBM_URL}/ml/v1/text/generation?version=2023-05-29`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: prompt,
        model_id: "ibm/granite-3-8b-instruct",
        project_id: process.env.IBM_PROJECT_ID,
        parameters: {
          decoding_method: "greedy",
          max_new_tokens: 400,
          temperature: 0.1,
          min_new_tokens: 80,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`WatsonX API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results || !data.results[0]) {
      throw new Error('Invalid response from WatsonX');
    }

    return this.parseDetailedResponse(data.results[0].generated_text, project, user);
  }

  /**
   * PROMPT DETALHADO PARA ANÁLISE PROFUNDA
   */
  private buildDetailedPrompt(user: UserProfile, project: Project): string {
    return `You are an expert volunteer-job matching AI. Analyze this specific match in detail.

=== VOLUNTEER PROFILE ===
Name: ${user.name}
Technical Skills: ${user.skills.join(', ')}
Location: ${user.location}
Availability: ${user.availability || 'Flexible'}
Bio: ${user.description || 'Volunteer'}

=== OPPORTUNITY DETAILS ===
Organization: ${project.organization}
Project: ${project.title}
Theme: ${project.theme || 'Social Impact'}
Location: ${project.location}
Required Skills: ${project.skills.join(', ')}
Description: ${project.description.substring(0, 800)}

=== YOUR TASK ===
Analyze ONLY this specific opportunity against this specific volunteer.

First, identify which of the volunteer's skills are RELEVANT to this opportunity:
- List EXACT skills from volunteer that match
- Be specific, don't generalize

Second, identify gaps:
- What skills is the volunteer missing?

Third, calculate match score (0-100):
- 90-100: Perfect fit, multiple skills match
- 70-89: Good fit, several skills match
- 50-69: Fair fit, some skills match
- 30-49: Poor fit, few skills match
- 0-29: Very poor fit, no skills match

Fourth, provide a personalized recommendation in Portuguese.

=== OUTPUT FORMAT (JSON ONLY) ===
{
  "score": number,
  "reasoning": "Detailed explanation of why this specific volunteer matches this opportunity",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "recommendation": "Personalized advice for this volunteer about this opportunity (in Portuguese)"
}

CRITICAL: Return ONLY valid JSON, no other text.`;
  }

  private parseDetailedResponse(aiText: string, project: Project, user: UserProfile): MatchResult {
    try {
      let cleanText = aiText.replace(/```json\n?/g, '');
      cleanText = cleanText.replace(/```\n?/g, '');
      cleanText = cleanText.trim();
      
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Garantir que matchedSkills são realmente das skills do usuário
      const validMatchedSkills = (parsed.matchedSkills || []).filter((skill: string) =>
        user.skills.some(us => 
          us.toLowerCase().includes(skill.toLowerCase()) || 
          skill.toLowerCase().includes(us.toLowerCase())
        )
      );
      
      const score = Math.min(100, Math.max(0, parsed.score || this.calculateBaseScore(user, project)));
      
      // Determinar prioridade baseada no score
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (score >= 75) priority = 'high';
      else if (score >= 50) priority = 'medium';
      else priority = 'low';
      
      return {
        projectId: project.id,
        score: score,
        reasoning: parsed.reasoning || this.generateReasoning(project, validMatchedSkills),
        matchedSkills: validMatchedSkills.slice(0, 4),
        missingSkills: (parsed.missingSkills || []).slice(0, 3),
        recommendation: parsed.recommendation || this.generateRecommendation(score, validMatchedSkills),
        priority
      };
      
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.createDetailedFallback(project, user);
    }
  }

  private calculateBaseScore(user: UserProfile, project: Project): number {
    const userSkills = user.skills.map(s => s.toLowerCase());
    const projectSkills = project.skills.map(s => s.toLowerCase());
    
    if (userSkills.length === 0) return 40;
    if (projectSkills.length === 0) return 45;
    
    let matches = 0;
    for (const userSkill of userSkills) {
      for (const projSkill of projectSkills) {
        if (userSkill.includes(projSkill) || projSkill.includes(userSkill)) {
          matches++;
          break;
        }
      }
    }
    
    const score = (matches / projectSkills.length) * 100;
    return Math.min(100, Math.max(20, Math.floor(score)));
  }

  private generateReasoning(project: Project, matchedSkills: string[]): string {
    if (matchedSkills.length > 0) {
      return `Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são relevantes para o projeto "${project.title}". Esta é uma oportunidade na área de ${project.theme || 'impacto social'}.`;
    }
    return `O projeto "${project.title}" da ${project.organization} busca voluntários. Uma oportunidade para desenvolver novas habilidades.`;
  }

  private generateRecommendation(score: number, matchedSkills: string[]): string {
    if (score >= 75) {
      return "🎯 Excelente! Este projeto está muito alinhado com seu perfil. Recomendamos fortemente que você se candidate!";
    } else if (score >= 50) {
      if (matchedSkills.length > 0) {
        return `👍 Bom potencial! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são valiosas. Candidate-se para ganhar experiência.`;
      }
      return "👍 Oportunidade interessante para expandir seu impacto social. Considere se candidatar!";
    } else {
      return "📚 Uma chance de aprender e contribuir em uma nova área. Mesmo sem experiência direta, você pode fazer a diferença.";
    }
  }

  private createDetailedFallback(project: Project, user: UserProfile): MatchResult {
    const score = this.calculateBaseScore(user, project);
    const userSkills = user.skills.map(s => s.toLowerCase());
    const projectSkills = project.skills.map(s => s.toLowerCase());
    
    const matchedSkills = projectSkills.filter(ps =>
      userSkills.some(us => us.includes(ps) || ps.includes(us))
    );
    
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (score >= 75) priority = 'high';
    else if (score >= 50) priority = 'medium';
    else priority = 'low';
    
    return {
      projectId: project.id,
      score,
      reasoning: this.generateReasoning(project, matchedSkills),
      matchedSkills: matchedSkills.slice(0, 4),
      missingSkills: [],
      recommendation: this.generateRecommendation(score, matchedSkills),
      priority
    };
  }

  private fallbackMatch(user: UserProfile, projects: Project[], limit: number): MatchResult[] {
    const results: MatchResult[] = [];
    
    for (const project of projects) {
      const score = this.calculateBaseScore(user, project);
      const userSkills = user.skills.map(s => s.toLowerCase());
      const projectSkills = project.skills.map(s => s.toLowerCase());
      
      const matchedSkills = projectSkills.filter(ps =>
        userSkills.some(us => us.includes(ps) || ps.includes(us))
      );
      
      const missingSkills = projectSkills.filter(ps =>
        !matchedSkills.some(ms => ms === ps)
      );
      
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (score >= 75) priority = 'high';
      else if (score >= 50) priority = 'medium';
      else priority = 'low';
      
      results.push({
        projectId: project.id,
        score,
        reasoning: this.generateReasoning(project, matchedSkills),
        matchedSkills: matchedSkills.slice(0, 4),
        missingSkills: missingSkills.slice(0, 3),
        recommendation: this.generateRecommendation(score, matchedSkills),
        priority
      });
    }
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}