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
      console.error('IBM_API_KEY not configured');
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
      console.error('Failed to get IBM token:', response.status);
      throw new Error('Failed to get IBM access token');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + 50 * 60 * 1000;

    if (!this.accessToken) {
      throw new Error('No access token received from IBM');
    }

    console.log('✅ IBM Access token obtained successfully');
    return this.accessToken;
  }

  async findBestMatches(
    user: UserProfile,
    projects: Project[],
    limit: number = 10
  ): Promise<MatchResult[]> {
    console.log('=== MATCH SERVICE STARTED ===');
    console.log('User skills:', user.skills);
    console.log('Total projects available:', projects.length);

    if (!projects || projects.length === 0) {
      return [];
    }

    // =========================
    // PRÉ-FILTRO AGRESSIVO BASEADO NAS SKILLS DO USUÁRIO
    // =========================
    const filteredProjects = this.aggressiveSkillFilter(user, projects);
    
    console.log(`📊 Pré-filtro: ${projects.length} -> ${filteredProjects.length} projetos`);
    console.log('Filtered project IDs:', filteredProjects.map(p => p.id));
    
    if (filteredProjects.length === 0) {
      console.log('⚠️ Nenhum projeto passou no pré-filtro');
      return [];
    }

    // Verificar se WatsonX está configurado
    const hasWatsonX = !!(process.env.IBM_API_KEY && process.env.IBM_URL && process.env.IBM_PROJECT_ID);
    console.log('WatsonX configured:', hasWatsonX);
    
    if (!hasWatsonX) {
      console.log('WatsonX not configured, using fallback');
      return this.intelligentFallback(user, filteredProjects, limit);
    }

    try {
      const accessToken = await this.getAccessToken();
      
      // Processar PROJETO POR PROJETO com análise detalhada
      const results: MatchResult[] = [];
      
      for (let i = 0; i < filteredProjects.length; i++) {
        const project = filteredProjects[i];
        console.log(`Analyzing project ${i + 1}/${filteredProjects.length}: ${project.title}`);
        
        try {
          const result = await this.deepAnalyzeMatch(user, project, accessToken);
          results.push(result);
          console.log(`  Score: ${result.score}, Priority: ${result.priority}`);
        } catch (error) {
          console.error(`Error analyzing project ${project.id}:`, error);
          // Fallback para este projeto específico
          const fallbackResult = this.createDetailedFallback(project, user);
          results.push(fallbackResult);
        }
        
        // Pequena pausa entre requisições
        if (i < filteredProjects.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Ordenar por score
      results.sort((a, b) => b.score - a.score);
      console.log(`Final results: ${results.length} matches, top score: ${results[0]?.score}`);
      return results.slice(0, limit);
      
    } catch (error) {
      console.error('WatsonX match error:', error);
      return this.intelligentFallback(user, filteredProjects, limit);
    }
  }

  /**
   * FILTRO AGRESSIVO - Só passa projetos com match real de skills
   */
  private aggressiveSkillFilter(user: UserProfile, projects: Project[]): Project[] {
    const userSkills = user.skills.map(s => s.toLowerCase().trim());
    
    console.log('User skills for filtering:', userSkills);
    
    if (userSkills.length === 0) {
      console.log('No user skills, returning first 10 projects');
      return projects.slice(0, 10);
    }
    
    const scoredProjects = projects.map(project => {
      const projectSkills = project.skills.map(s => s.toLowerCase());
      const projectText = `${project.title} ${project.description} ${project.theme}`.toLowerCase();
      
      let matchScore = 0;
      const matchedSkills: string[] = [];
      
      // Match exato de skills (peso 5)
      for (const userSkill of userSkills) {
        for (const projSkill of projectSkills) {
          if (projSkill.includes(userSkill) || userSkill.includes(projSkill)) {
            matchScore += 5;
            matchedSkills.push(projSkill);
            break;
          }
        }
      }
      
      // Skills na descrição (peso 2)
      for (const userSkill of userSkills) {
        if (projectText.includes(userSkill)) {
          matchScore += 2;
        }
      }
      
      return { project, matchScore, matchedSkillsCount: matchedSkills.length };
    });
    
    // Filtrar projetos com score > 0 E pelo menos 1 skill match direto
    let filtered = scoredProjects.filter(p => p.matchScore > 0);
    
    console.log(`Projects with skill matches: ${filtered.length}`);
    
    // Se ainda tem muitos, pegar os TOP 15 com maior score
    if (filtered.length > 15) {
      filtered.sort((a, b) => b.matchScore - a.matchScore);
      filtered = filtered.slice(0, 15);
      console.log(`Reduced to top 15 by score`);
    }
    
    // Se não encontrou nenhum, retornar primeiros 5 como fallback
    if (filtered.length === 0) {
      console.log('No skill matches found, returning first 5 projects as fallback');
      return projects.slice(0, 5);
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
      const errorText = await response.text();
      console.error(`WatsonX API error ${response.status}:`, errorText);
      throw new Error(`WatsonX API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results || !data.results[0]) {
      console.error('Invalid WatsonX response:', data);
      throw new Error('Invalid response from WatsonX');
    }

    const aiResponse = data.results[0].generated_text;
    console.log(`AI Response for ${project.title}:`, aiResponse.substring(0, 200));
    
    return this.parseDetailedResponse(aiResponse, project, user);
  }

  private buildDetailedPrompt(user: UserProfile, project: Project): string {
    return `You are an expert volunteer-job matching AI. Analyze this specific match in detail.

=== VOLUNTEER PROFILE ===
Name: ${user.name}
Skills: ${user.skills.join(', ')}
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

First, identify which of the volunteer's skills are RELEVANT to this opportunity.
Be SPECIFIC and EXACT - list only skills that actually appear in the volunteer's list above.

Second, calculate match score (0-100) based on skill overlap:
- 90-100: Multiple skills match perfectly
- 70-89: Several skills match
- 50-69: Some skills match partially
- 30-49: Few skills match
- 0-29: No skills match

Third, provide a personalized recommendation in Portuguese.

=== OUTPUT FORMAT (JSON ONLY) ===
{
  "score": number,
  "reasoning": "Detailed explanation of why this specific volunteer matches this opportunity",
  "matchedSkills": ["skill1", "skill2", "skill3"],
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
      
      // Validar que as matchedSkills realmente existem nas skills do usuário
      const validMatchedSkills = (parsed.matchedSkills || []).filter((skill: string) =>
        user.skills.some(us => 
          us.toLowerCase().includes(skill.toLowerCase()) || 
          skill.toLowerCase().includes(us.toLowerCase())
        )
      );
      
      // Calcular score baseado nas skills se não veio da IA
      let score = parsed.score;
      if (!score || score < 0 || score > 100) {
        score = this.calculateSkillBasedScore(user, project);
      } else {
        score = Math.min(100, Math.max(0, score));
      }
      
      // Determinar prioridade
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (score >= 70) priority = 'high';
      else if (score >= 45) priority = 'medium';
      else priority = 'low';
      
      // Gerar reasoning personalizado baseado nas skills
      let reasoning = parsed.reasoning;
      if (!reasoning || validMatchedSkills.length === 0) {
        reasoning = this.generatePersonalizedReasoning(project, validMatchedSkills, user);
      }
      
      // Gerar recommendation personalizada
      let recommendation = parsed.recommendation;
      if (!recommendation) {
        recommendation = this.generatePersonalizedRecommendation(score, validMatchedSkills, project);
      }
      
      return {
        projectId: project.id,
        score,
        reasoning,
        matchedSkills: validMatchedSkills.slice(0, 5),
        missingSkills: (parsed.missingSkills || []).slice(0, 3),
        recommendation,
        priority
      };
      
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.createDetailedFallback(project, user);
    }
  }

  private calculateSkillBasedScore(user: UserProfile, project: Project): number {
    const userSkills = user.skills.map(s => s.toLowerCase());
    const projectSkills = project.skills.map(s => s.toLowerCase());
    const projectText = `${project.title} ${project.description} ${project.theme}`.toLowerCase();
    
    if (userSkills.length === 0) return 30;
    if (projectSkills.length === 0 && projectText.length === 0) return 35;
    
    let matchCount = 0;
    const matchedSkills: string[] = [];
    
    // Match direto com skills do projeto
    for (const userSkill of userSkills) {
      for (const projSkill of projectSkills) {
        if (projSkill.includes(userSkill) || userSkill.includes(projSkill)) {
          matchCount++;
          matchedSkills.push(projSkill);
          break;
        }
      }
    }
    
    // Match com texto da descrição
    let textMatches = 0;
    for (const userSkill of userSkills) {
      if (projectText.includes(userSkill)) {
        textMatches++;
      }
    }
    
    let score = 0;
    if (projectSkills.length > 0) {
      score = (matchCount / projectSkills.length) * 70;
    } else {
      score = (textMatches / userSkills.length) * 50;
    }
    
    // Bônus por múltiplos matches
    if (matchCount >= 2) score += 10;
    if (textMatches >= 3) score += 10;
    
    return Math.min(100, Math.max(20, Math.floor(score)));
  }

  private generatePersonalizedReasoning(project: Project, matchedSkills: string[], user: UserProfile): string {
    if (matchedSkills.length > 0) {
      const skillList = matchedSkills.slice(0, 3).join(', ');
      return `✅ Suas habilidades em ${skillList} são diretamente relevantes para o projeto "${project.title}". Você tem perfil alinhado com as necessidades desta organização.`;
    }
    
    // Verificar skills que poderiam ser úteis
    const userSkills = user.skills;
    const projectText = `${project.title} ${project.description}`.toLowerCase();
    const relevantSkills = userSkills.filter(skill => 
      projectText.includes(skill.toLowerCase())
    );
    
    if (relevantSkills.length > 0) {
      return `💡 Sua experiência em ${relevantSkills.slice(0, 2).join(', ')} pode ser aplicada no projeto "${project.title}". Considere esta oportunidade.`;
    }
    
    return `📋 O projeto "${project.title}" da ${project.organization} busca voluntários. Sua experiência pode contribuir de maneira valiosa.`;
  }

  private generatePersonalizedRecommendation(score: number, matchedSkills: string[], project: Project): string {
    if (score >= 70 && matchedSkills.length > 0) {
      return `🎯 EXCELENTE MATCH! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são exatamente o que o projeto "${project.title}" precisa. Recomendamos candidatura imediata!`;
    } else if (score >= 50) {
      if (matchedSkills.length > 0) {
        return `👍 BOM POTENCIAL! Suas habilidades em ${matchedSkills.slice(0, 2).join(', ')} são relevantes. Candidate-se para ganhar experiência na área.`;
      }
      return `👍 OPORTUNIDADE INTERESSANTE! Embora não haja match direto de habilidades, sua experiência pode ser valiosa. Considere se candidatar.`;
    } else {
      return `📚 OPORTUNIDADE DE CRESCIMENTO! Este projeto pode ajudar você a desenvolver novas habilidades e ampliar seu impacto social.`;
    }
  }

  private intelligentFallback(user: UserProfile, projects: Project[], limit: number): MatchResult[] {
    console.log('Using intelligent fallback matching');
    
    const results: MatchResult[] = [];
    
    for (const project of projects) {
      const score = this.calculateSkillBasedScore(user, project);
      const userSkills = user.skills.map(s => s.toLowerCase());
      const projectSkills = project.skills.map(s => s.toLowerCase());
      const projectText = `${project.title} ${project.description}`.toLowerCase();
      
      // Encontrar skills que realmente correspondem
      const matchedSkills = projectSkills.filter(ps =>
        userSkills.some(us => us.includes(ps) || ps.includes(us))
      );
      
      // Skills da descrição que correspondem
      const descMatchedSkills = userSkills.filter(us =>
        projectText.includes(us) && !matchedSkills.some(ms => ms.toLowerCase().includes(us))
      );
      
      const allMatchedSkills = [...matchedSkills, ...descMatchedSkills.slice(0, 2)];
      
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (score >= 70) priority = 'high';
      else if (score >= 45) priority = 'medium';
      else priority = 'low';
      
      const reasoning = this.generatePersonalizedReasoning(project, allMatchedSkills, user);
      const recommendation = this.generatePersonalizedRecommendation(score, allMatchedSkills, project);
      
      results.push({
        projectId: project.id,
        score,
        reasoning,
        matchedSkills: allMatchedSkills.slice(0, 5),
        missingSkills: [],
        recommendation,
        priority
      });
    }
    
    results.sort((a, b) => b.score - a.score);
    console.log(`Fallback results: ${results.length} matches, top score: ${results[0]?.score}`);
    return results.slice(0, limit);
  }

  private createDetailedFallback(project: Project, user: UserProfile): MatchResult {
    const score = this.calculateSkillBasedScore(user, project);
    const userSkills = user.skills.map(s => s.toLowerCase());
    const projectSkills = project.skills.map(s => s.toLowerCase());
    const projectText = `${project.title} ${project.description}`.toLowerCase();
    
    const matchedSkills = projectSkills.filter(ps =>
      userSkills.some(us => us.includes(ps) || ps.includes(us))
    );
    
    const descMatchedSkills = userSkills.filter(us =>
      projectText.includes(us) && !matchedSkills.some(ms => ms.toLowerCase().includes(us))
    );
    
    const allMatchedSkills = [...matchedSkills, ...descMatchedSkills.slice(0, 2)];
    
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (score >= 70) priority = 'high';
    else if (score >= 45) priority = 'medium';
    else priority = 'low';
    
    return {
      projectId: project.id,
      score,
      reasoning: this.generatePersonalizedReasoning(project, allMatchedSkills, user),
      matchedSkills: allMatchedSkills.slice(0, 5),
      missingSkills: [],
      recommendation: this.generatePersonalizedRecommendation(score, allMatchedSkills, project),
      priority
    };
  }
}